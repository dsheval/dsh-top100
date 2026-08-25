/** Fetch and filter the published rankings document. */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isInstalledEntry, resolveInstallSpec } from "../install/install-spec.js";
import { entryMatchesCategory } from "../shared/categories.js";
import { matchesSearchQuery, scoreSearchEntry, tokenizeSearchQuery } from "../shared/search.js";
export const DEFAULT_DATA_URL = "https://www.dsheval.ai/data";
const CACHE_MS = 5 * 60 * 1000;
const FETCH_MS = 20_000;
const WINDOWS_FETCH_MS = 45_000;
const execFileAsync = promisify(execFile);
let cache = null;
export function normalizeDataUrl(raw) {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("dataUrl must be http or https");
    }
    return raw.replace(/\/+$/, "");
}
export function isRankingView(value) {
    return value === "hot" || value === "rising" || value === "total" || value === "category";
}
export function matchesQuery(entry, query) {
    return matchesSearchQuery(entry, query);
}
function annotate(entry, installed) {
    const installSpec = resolveInstallSpec(entry);
    return {
        ...entry,
        installSpec,
        installable: installSpec !== null,
        installed: isInstalledEntry(entry, installed),
    };
}
export function filterCatalog(document, options) {
    const hasQuery = tokenizeSearchQuery(options.query).length > 0;
    const source = hasQuery || options.view === "category"
        ? document.rankings.total
        : document.rankings[options.view] ?? [];
    const scored = source
        .filter((entry) => !options.excludeSkills || entry.type?.toLowerCase() !== "skill")
        .filter((entry) => options.view !== "category" || (options.category !== null && entryMatchesCategory(entry, options.category)))
        .map((entry) => ({ entry, score: scoreSearchEntry(entry, options.query) }))
        .filter((item) => item.score !== null);
    if (hasQuery) {
        scored.sort((left, right) => right.score - left.score || left.entry.rank - right.entry.rank);
    }
    const matched = scored.map(({ entry }) => annotate(entry, options.installed));
    return {
        total: matched.length,
        items: matched.slice(options.offset, options.offset + options.limit),
    };
}
export function invalidateCatalog() {
    cache = null;
}
function fetchCause(error) {
    if (!(error instanceof Error))
        return { message: String(error) };
    const cause = error.cause;
    if (cause instanceof Error) {
        const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
        return { message: cause.message || error.message, code };
    }
    return { message: error.message };
}
export function describeCatalogFetchError(error) {
    const { message, code } = fetchCause(error);
    if (message === "fetch failed" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || /certificate|SSL|TLS|CERT_/i.test(`${code ?? ""} ${message}`)) {
        return `证书校验失败${code ? ` (${code})` : ""}`;
    }
    return message;
}
export function isRetryableCatalogFetchError(error) {
    const { message, code } = fetchCause(error);
    return message === "fetch failed" || /certificate|SSL|TLS|CERT_|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|UNABLE_TO_VERIFY/i.test(`${code ?? ""} ${message}`);
}
async function fetchCatalogText(url) {
    const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "dsh-top100-plugin" },
        signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!response.ok)
        throw new Error(`rankings fetch failed: ${response.status} ${response.statusText}`);
    const text = await response.text();
    if (!text.trimStart().startsWith("{")) {
        throw new Error(`rankings fetch failed: unexpected content-type ${response.headers.get("content-type") ?? "unknown"}`);
    }
    return text;
}
function quoteForPowerShell(value) { return `'${value.replace(/'/g, "''")}'`; }
async function fetchCatalogTextWindows(url) {
    const directory = await mkdtemp(join(tmpdir(), "dsh-top100-"));
    const file = join(directory, "rankings.json");
    const systemRoot = process.env.SystemRoot || "C:\\Windows";
    try {
        await execFileAsync(join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), [
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command",
            [
                "$ProgressPreference = 'SilentlyContinue'",
                "$ErrorActionPreference = 'Stop'",
                `Invoke-WebRequest -Uri ${quoteForPowerShell(url)} -OutFile ${quoteForPowerShell(file)} -UseBasicParsing -TimeoutSec 40`,
            ].join("; "),
        ], { timeout: WINDOWS_FETCH_MS, windowsHide: true });
        const text = await readFile(file, "utf8");
        if (!text.trimStart().startsWith("{"))
            throw new Error("Windows fallback returned non-JSON");
        return text;
    }
    catch (error) {
        throw new Error(`系统网络栈回退失败: ${describeCatalogFetchError(error)}`);
    }
    finally {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
}
export function parseRankingsDocument(raw) {
    let document;
    try {
        document = JSON.parse(raw);
    }
    catch {
        throw new Error("rankings.json is not valid JSON");
    }
    if (!document?.rankings || !Array.isArray(document.rankings.total)) {
        throw new Error("rankings.json is missing rankings.total");
    }
    document.rankings.hot = Array.isArray(document.rankings.hot) ? document.rankings.hot : [];
    document.rankings.rising = Array.isArray(document.rankings.rising) ? document.rankings.rising : [];
    return document;
}
export async function loadRankings(dataUrl, force = false) {
    const url = `${normalizeDataUrl(dataUrl)}/rankings.json`;
    if (!force && cache && cache.dataUrl === url && Date.now() - cache.fetchedAt < CACHE_MS) {
        return cache.document;
    }
    let raw;
    try {
        raw = await fetchCatalogText(url);
    }
    catch (error) {
        if (process.platform === "win32" && isRetryableCatalogFetchError(error)) {
            try {
                raw = await fetchCatalogTextWindows(url);
            }
            catch (fallbackError) {
                throw new Error(`${describeCatalogFetchError(error)}; ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
            }
        }
        else {
            throw new Error(describeCatalogFetchError(error));
        }
    }
    const document = parseRankingsDocument(raw);
    cache = { dataUrl: url, fetchedAt: Date.now(), document };
    return document;
}
export function findEntry(document, fullName) {
    const needle = fullName.toLowerCase();
    return document.rankings.total.find((entry) => entry.fullName.toLowerCase() === needle);
}
