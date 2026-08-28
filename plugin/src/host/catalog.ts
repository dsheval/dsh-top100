/** Fetch and filter the published rankings document. */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isInstalledEntry, resolveInstallSpec } from "../install/install-spec.js";
import { entryMatchesCategory } from "../shared/categories.js";
import { matchesSearchQuery, scoreSearchEntry, tokenizeSearchQuery } from "../shared/search.js";
import type {
  CatalogItem,
  RankingEntry,
  RankingsDocument,
  RankingView,
  PluginCategoryId,
} from "../shared/types.js";

export const DEFAULT_DATA_URL = "https://www.dsheval.ai/data";
const CACHE_MS = 30 * 60 * 1000;
const FETCH_MS = 15_000;
const WINDOWS_FETCH_MS = 45_000;
const execFileAsync = promisify(execFile);

export interface CatalogCache {
  dataUrl: string;
  fetchedAt: number;
  document: RankingsDocument;
}

interface CatalogDiskCache extends CatalogCache {
  schemaVersion: 1;
}

type CatalogParser = (raw: string) => RankingsDocument;

class CatalogSourceError extends Error {
  fallbackToFull: boolean;
  status: number | null;

  constructor(message: string, options: { fallbackToFull?: boolean; status?: number } = {}) {
    super(message);
    this.name = "CatalogSourceError";
    this.fallbackToFull = options.fallbackToFull ?? false;
    this.status = options.status ?? null;
  }
}

const caches = new Map<string, CatalogCache>();
const inFlight = new Map<string, Promise<RankingsDocument>>();

export function normalizeDataUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("dataUrl must be http or https");
  }
  return raw.replace(/\/+$/, "");
}

export function isRankingView(value: string | null): value is RankingView {
  return value === "hot" || value === "rising" || value === "total" || value === "category";
}

export function matchesQuery(entry: RankingEntry, query: string): boolean {
  return matchesSearchQuery(entry, query);
}

function annotate(entry: RankingEntry, installed: Record<string, string>): CatalogItem {
  const installSpec = resolveInstallSpec(entry);
  return {
    ...entry,
    installSpec,
    installable: installSpec !== null,
    installed: isInstalledEntry(entry, installed),
  };
}

export function filterCatalog(
  document: RankingsDocument,
  options: {
    view: RankingView;
    category: PluginCategoryId | null;
    query: string;
    offset: number;
    limit: number;
    installed: Record<string, string>;
    excludeSkills?: boolean;
  },
): { total: number; items: CatalogItem[] } {
  const hasQuery = tokenizeSearchQuery(options.query).length > 0;
  const source = hasQuery || options.view === "category"
    ? document.rankings.total
    : document.rankings[options.view] ?? [];
  const scored = source
    .filter((entry) => !options.excludeSkills || entry.type?.toLowerCase() !== "skill")
    .filter((entry) => options.view !== "category" || (options.category !== null && entryMatchesCategory(entry, options.category)))
    .map((entry) => ({ entry, score: scoreSearchEntry(entry, options.query) }))
    .filter((item): item is { entry: RankingEntry; score: number } => item.score !== null);
  if (hasQuery) {
    scored.sort((left, right) => right.score - left.score || left.entry.rank - right.entry.rank);
  }
  const matched = scored.map(({ entry }) => annotate(entry, options.installed));
  return {
    total: matched.length,
    items: matched.slice(options.offset, options.offset + options.limit),
  };
}

export function invalidateCatalog(): void {
  caches.clear();
}

function catalogCacheDirectory(): string {
  if (process.env.DSH_TOP100_CACHE_DIR?.trim()) return process.env.DSH_TOP100_CACHE_DIR.trim();
  const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(dshHome, "cache", "dsh-top100");
}

function catalogCachePath(url: string): string {
  const key = createHash("sha256").update(url).digest("hex").slice(0, 24);
  return join(catalogCacheDirectory(), `${key}.json`);
}

function validDocument(value: unknown): value is RankingsDocument {
  if (value === null || typeof value !== "object") return false;
  const document = value as Partial<RankingsDocument>;
  return Boolean(
    document.rankings
    && Array.isArray(document.rankings.total)
    && Array.isArray(document.rankings.hot)
    && Array.isArray(document.rankings.rising),
  );
}

async function readDiskCache(url: string): Promise<CatalogCache | null> {
  try {
    const payload = JSON.parse(await readFile(catalogCachePath(url), "utf8")) as Partial<CatalogDiskCache>;
    if (
      payload.schemaVersion !== 1
      || payload.dataUrl !== url
      || !Number.isFinite(payload.fetchedAt)
      || !validDocument(payload.document)
    ) return null;
    return { dataUrl: url, fetchedAt: Number(payload.fetchedAt), document: payload.document };
  } catch {
    return null;
  }
}

async function writeDiskCache(value: CatalogCache): Promise<void> {
  const path = catalogCachePath(value.dataUrl);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await mkdir(catalogCacheDirectory(), { recursive: true });
    const payload: CatalogDiskCache = { schemaVersion: 1, ...value };
    await writeFile(temporary, `${JSON.stringify(payload)}\n`, "utf8");
    try {
      await rename(temporary, path);
    } catch {
      // Windows does not replace an existing destination with rename(). Keep a restorable last-good copy.
      const backup = `${path}.${process.pid}.${Date.now()}.bak`;
      await rename(path, backup);
      try {
        await rename(temporary, path);
      } catch (replacementError) {
        await rename(backup, path).catch(() => undefined);
        throw replacementError;
      }
      await rm(backup, { force: true }).catch(() => undefined);
    }
  } catch {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function fetchCause(error: unknown): { message: string; code?: string } {
  if (!(error instanceof Error)) return { message: String(error) };
  const cause = error.cause;
  if (cause instanceof Error) {
    const code = "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
    return { message: cause.message || error.message, code };
  }
  return { message: error.message };
}

export function describeCatalogFetchError(error: unknown): string {
  const { message, code } = fetchCause(error);
  if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || /certificate|SSL|TLS|CERT_/i.test(`${code ?? ""} ${message}`)) {
    return `证书校验失败${code ? ` (${code})` : ""}`;
  }
  if (/timeout|timed out|aborted due to timeout/i.test(message)) {
    return "榜单请求超时，请检查网络后重试";
  }
  const http = message.match(/^rankings fetch failed:\s*(\d{3})\s*(.*)$/i);
  if (http) return `榜单服务器请求失败（HTTP ${http[1]}${http[2] ? ` ${http[2]}` : ""}）`;
  if (/unexpected content-type/i.test(message)) return "榜单服务器返回了非 JSON 内容";
  if (message === "fetch failed" || /ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(`${code ?? ""} ${message}`)) {
    return "榜单网络连接失败，请检查网络、DNS 或代理设置后重试";
  }
  return message;
}

export function isRetryableCatalogFetchError(error: unknown): boolean {
  const { message, code } = fetchCause(error);
  return message === "fetch failed" || /certificate|SSL|TLS|CERT_|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|UNABLE_TO_VERIFY/i.test(`${code ?? ""} ${message}`);
}

async function fetchCatalogText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "dsh-top100-plugin" },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!response.ok) {
    throw new CatalogSourceError(
      `榜单服务器请求失败（HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}）`,
      { fallbackToFull: response.status === 404, status: response.status },
    );
  }
  const text = await response.text();
  if (!text.trimStart().startsWith("{")) {
    throw new CatalogSourceError("榜单服务器返回了非 JSON 内容", { fallbackToFull: true });
  }
  return text;
}

function quoteForPowerShell(value: string): string { return `'${value.replace(/'/g, "''")}'`; }

async function fetchCatalogTextWindows(url: string): Promise<string> {
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
    if (!text.trimStart().startsWith("{")) throw new Error("Windows fallback returned non-JSON");
    return text;
  } catch (error) {
    throw new Error(`系统网络栈回退失败: ${describeCatalogFetchError(error)}`);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function parseRankingsDocument(raw: string): RankingsDocument {
  let document: RankingsDocument;
  try { document = JSON.parse(raw) as RankingsDocument; }
  catch { throw new Error("rankings.json is not valid JSON"); }
  if (!document?.rankings || !Array.isArray(document.rankings.total)) {
    throw new Error("rankings.json is missing rankings.total");
  }
  document.rankings.hot = Array.isArray(document.rankings.hot) ? document.rankings.hot : [];
  document.rankings.rising = Array.isArray(document.rankings.rising) ? document.rankings.rising : [];
  return document;
}

export function parseRankingViewDocument(raw: string, view: "hot" | "rising"): RankingsDocument {
  let payload: Omit<RankingsDocument, "rankings"> & { rankings: RankingEntry[] };
  try { payload = JSON.parse(raw) as typeof payload; }
  catch { throw new CatalogSourceError(`榜单分片 rankings-${view}.json 不是有效 JSON`, { fallbackToFull: true }); }
  if (!Array.isArray(payload?.rankings)) {
    throw new CatalogSourceError(`榜单分片 rankings-${view}.json 缺少 rankings`, { fallbackToFull: true });
  }
  const entries = payload.rankings;
  return {
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    snapshotDate: payload.snapshotDate,
    definitions: payload.definitions,
    categories: payload.categories,
    rankings: {
      total: entries,
      hot: view === "hot" ? entries : [],
      rising: view === "rising" ? entries : [],
    },
  };
}

async function downloadCatalog(url: string, parser: CatalogParser): Promise<RankingsDocument> {
  let raw: string;
  try {
    raw = await fetchCatalogText(url);
  } catch (error) {
    if (error instanceof CatalogSourceError) throw error;
    if (process.platform === "win32" && isRetryableCatalogFetchError(error)) {
      try { raw = await fetchCatalogTextWindows(url); }
      catch (fallbackError) {
        throw new Error(`${describeCatalogFetchError(error)}; ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    } else {
      throw new Error(describeCatalogFetchError(error));
    }
  }
  const document = parser(raw);
  const value: CatalogCache = { dataUrl: url, fetchedAt: Date.now(), document };
  caches.set(url, value);
  await writeDiskCache(value);
  return document;
}

function refreshCatalog(url: string, parser: CatalogParser): Promise<RankingsDocument> {
  const pending = inFlight.get(url);
  if (pending) return pending;
  const task = downloadCatalog(url, parser);
  inFlight.set(url, task);
  const cleanup = (): void => {
    if (inFlight.get(url) === task) inFlight.delete(url);
  };
  void task.then(cleanup, cleanup);
  return task;
}

async function loadCatalogDocument(
  url: string,
  parser: CatalogParser,
  force: boolean,
  fallbackToCache = true,
): Promise<RankingsDocument> {
  const cached = await cachedCatalog(url);
  if (!force && cached) {
    if (Date.now() - cached.fetchedAt >= CACHE_MS) {
      // Stale-while-revalidate: keep the page responsive and refresh the last-good snapshot off-screen.
      void refreshCatalog(url, parser).catch(() => undefined);
    }
    return cached.document;
  }
  try {
    return await refreshCatalog(url, parser);
  } catch (error) {
    if (cached && fallbackToCache) return cached.document;
    throw error;
  }
}

export async function loadRankings(dataUrl: string, force = false): Promise<RankingsDocument> {
  const url = `${normalizeDataUrl(dataUrl)}/rankings.json`;
  return loadCatalogDocument(url, parseRankingsDocument, force);
}

async function cachedCatalog(url: string): Promise<CatalogCache | null> {
  const memory = caches.get(url);
  if (memory) return memory;
  const disk = await readDiskCache(url);
  if (disk) caches.set(url, disk);
  return disk;
}

/** Return a last-good full or view cache without ever delaying local management on the network. */
export async function loadCachedRankings(dataUrl: string): Promise<RankingsDocument | null> {
  const baseUrl = normalizeDataUrl(dataUrl);
  for (const filename of ["rankings.json", "rankings-hot.json", "rankings-rising.json"]) {
    const cached = await cachedCatalog(`${baseUrl}/${filename}`);
    if (cached) return cached.document;
  }
  return null;
}

function catalogSnapshotTime(value: CatalogCache): number {
  const generatedAt = Date.parse(value.document.generatedAt);
  return Number.isFinite(generatedAt) ? generatedAt : value.fetchedAt;
}

/** Resolve installation metadata from a current, authoritative full catalog snapshot. */
export async function findPublishedEntry(
  dataUrl: string,
  fullName: string,
): Promise<RankingEntry | undefined> {
  const baseUrl = normalizeDataUrl(dataUrl);
  const fullUrl = `${baseUrl}/rankings.json`;
  const [full, hot, rising] = await Promise.all([
    cachedCatalog(fullUrl),
    cachedCatalog(`${baseUrl}/rankings-hot.json`),
    cachedCatalog(`${baseUrl}/rankings-rising.json`),
  ]);
  const newestShardTime = Math.max(
    ...[hot, rising].filter((value): value is CatalogCache => value !== null).map(catalogSnapshotTime),
    Number.NEGATIVE_INFINITY,
  );
  if (
    full
    && Date.now() - full.fetchedAt < CACHE_MS
    && catalogSnapshotTime(full) >= newestShardTime
  ) {
    return findEntry(full.document, fullName);
  }
  const current = await loadCatalogDocument(fullUrl, parseRankingsDocument, true, false);
  return findEntry(current, fullName);
}

/** Load the small published shard used by the initial hot/rising tabs. */
export async function loadRankingView(
  dataUrl: string,
  view: "hot" | "rising",
  force = false,
): Promise<RankingsDocument> {
  const baseUrl = normalizeDataUrl(dataUrl);
  const url = `${baseUrl}/rankings-${view}.json`;
  try {
    return await loadCatalogDocument(url, (raw) => parseRankingViewDocument(raw, view), force);
  } catch (error) {
    if (error instanceof CatalogSourceError && error.fallbackToFull) {
      return loadRankings(baseUrl, force);
    }
    throw error;
  }
}

export function findEntry(document: RankingsDocument, fullName: string): RankingEntry | undefined {
  const needle = fullName.toLowerCase();
  return document.rankings.total.find((entry) => entry.fullName.toLowerCase() === needle);
}
