/** Fetch and filter the published rankings document. */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isInstalledEntry, parseInstallSpec, resolveInstallSpec } from "../install/install-spec.js";
import { catalogCategories, entryMatchesCategory, isPluginCategoryId } from "../shared/categories.js";
import { matchesSearchQuery, scoreSearchEntry, tokenizeSearchQuery } from "../shared/search.js";
import { catalogEvidence } from "../shared/evidence.js";
import type {
  CatalogCacheStatus,
  CatalogCategoryDefinition,
  CatalogItem,
  CatalogScope,
  CatalogScopeCounts,
  InstallAvailability,
  PluginCategoryDefinition,
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

interface RankingFileReferenceV2 {
  url: string;
  count: number;
  bytes: number;
  sha256: string;
}

interface RankingPageReferenceV2 extends RankingFileReferenceV2 {
  page: number;
}

interface RankingManifestV2 {
  schemaVersion: 2;
  snapshotId: string;
  generatedAt: string;
  snapshotDate: string;
  pageSize: number;
  definitions?: RankingsDocument["definitions"];
  datasets: {
    hot: RankingFileReferenceV2;
    rising: RankingFileReferenceV2;
    skills?: RankingFileReferenceV2;
    search: RankingFileReferenceV2;
    total: {
      count: number;
      skillCount?: number;
      pageSize: number;
      pageCount: number;
      pages: RankingPageReferenceV2[];
    };
  };
  categories: Array<PluginCategoryDefinition & {
    skillCount?: number;
    pageSize: number;
    pageCount: number;
    pages: RankingPageReferenceV2[];
  }>;
}

interface RankingManifestCache {
  fetchedAt: number;
  manifest: RankingManifestV2;
}

interface RankingManifestDiskCache extends RankingManifestCache {
  schemaVersion: 1;
  dataUrl: string;
}

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
const fallbackReasons = new Map<string, string>();
const manifestCaches = new Map<string, RankingManifestCache>();
const manifestInFlight = new Map<string, Promise<RankingManifestV2>>();

export function normalizeDataUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("dataUrl must be http or https");
  }
  return raw.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validFileReference(value: unknown): value is RankingFileReferenceV2 {
  if (!isRecord(value)) return false;
  return typeof value.url === "string"
    && typeof value.count === "number"
    && Number.isInteger(value.count)
    && typeof value.bytes === "number"
    && Number.isInteger(value.bytes)
    && typeof value.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(value.sha256);
}

function validPageReference(value: unknown): value is RankingPageReferenceV2 {
  const page = isRecord(value) ? value.page : undefined;
  return validFileReference(value)
    && typeof page === "number"
    && Number.isInteger(page)
    && page > 0;
}

function validManifestCategory(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && isPluginCategoryId(value.id)
    && typeof value.label === "string"
    && typeof value.description === "string"
    && typeof value.count === "number"
    && Number.isInteger(value.count)
    && (value.skillCount === undefined || (
      typeof value.skillCount === "number"
      && Number.isInteger(value.skillCount)
      && value.skillCount >= 0
      && value.skillCount <= value.count
    ))
    && typeof value.pageSize === "number"
    && Number.isInteger(value.pageSize)
    && typeof value.pageCount === "number"
    && Number.isInteger(value.pageCount)
    && Array.isArray(value.pages)
    && value.pages.every(validPageReference);
}

export function parseRankingManifest(raw: string): RankingManifestV2 {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new CatalogSourceError("榜单 manifest 不是有效 JSON", { fallbackToFull: true }); }
  if (!isRecord(value)
    || value.schemaVersion !== 2
    || typeof value.snapshotId !== "string"
    || value.snapshotId.length === 0
    || typeof value.generatedAt !== "string"
    || typeof value.snapshotDate !== "string"
    || typeof value.pageSize !== "number"
    || !Number.isInteger(value.pageSize)
    || value.pageSize <= 0
  ) {
    throw new CatalogSourceError("榜单 manifest 版本不受支持", { fallbackToFull: true });
  }
  const datasets = value.datasets;
  if (!isRecord(datasets)
    || !validFileReference(datasets.hot)
    || !validFileReference(datasets.rising)
    || (datasets.skills !== undefined && !validFileReference(datasets.skills))
    || !validFileReference(datasets.search)
    || !isRecord(datasets.total)
    || typeof datasets.total.count !== "number"
    || !Number.isInteger(datasets.total.count)
    || (datasets.total.skillCount !== undefined && (
      typeof datasets.total.skillCount !== "number"
      || !Number.isInteger(datasets.total.skillCount)
      || datasets.total.skillCount < 0
      || datasets.total.skillCount > datasets.total.count
    ))
    || typeof datasets.total.pageSize !== "number"
    || !Number.isInteger(datasets.total.pageSize)
    || datasets.total.pageSize <= 0
    || typeof datasets.total.pageCount !== "number"
    || !Number.isInteger(datasets.total.pageCount)
    || !Array.isArray(datasets.total.pages)
    || !datasets.total.pages.every(validPageReference)
  ) {
    throw new CatalogSourceError("榜单 manifest 缺少有效的数据引用", { fallbackToFull: true });
  }
  if (!Array.isArray(value.categories) || !value.categories.every(validManifestCategory)) {
    throw new CatalogSourceError("榜单 manifest 缺少分类定义", { fallbackToFull: true });
  }
  return value as unknown as RankingManifestV2;
}

function manifestFileUrl(dataUrl: string, reference: RankingFileReferenceV2): string {
  const base = new URL(`${normalizeDataUrl(dataUrl)}/`);
  const resolved = new URL(reference.url, base);
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(`${basePath}snapshots/`)) {
    throw new CatalogSourceError("榜单 manifest 引用了不受信任的数据地址", { fallbackToFull: true });
  }
  return resolved.toString();
}

function verifySnapshot(raw: string, reference: RankingFileReferenceV2): void {
  const bytes = Buffer.byteLength(raw);
  const digest = createHash("sha256").update(raw).digest("hex");
  if (bytes !== reference.bytes || digest !== reference.sha256) {
    throw new CatalogSourceError("榜单快照完整性校验失败", { fallbackToFull: true });
  }
}

function manifestCategories(manifest: RankingManifestV2): PluginCategoryDefinition[] {
  return manifest.categories.map(({ id, label, description, count }) => ({ id, label, description, count }));
}

function manifestPluginCategories(manifest: RankingManifestV2): PluginCategoryDefinition[] {
  return manifest.categories.map(({ id, label, description, count, skillCount = 0 }) => ({
    id,
    label,
    description,
    count: Math.max(0, count - skillCount),
  }));
}

export function isRankingView(value: string | null): value is RankingView {
  return value === "hot" || value === "rising" || value === "total";
}

export function isCatalogScope(value: string | null): value is CatalogScope {
  return value === "plugins" || value === "skills" || value === "ecosystem";
}

export function isInstallAvailability(value: string | null): value is InstallAvailability {
  return value === "all" || value === "installable" || value === "unavailable";
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
    evidence: catalogEvidence(entry),
  };
}

function entryMatchesCatalogScope(entry: RankingEntry, scope: CatalogScope): boolean {
  const evidence = catalogEvidence(entry);
  const isSkill = entry.type?.toLowerCase() === "skill";
  if (scope === "plugins") return !isSkill && evidence.compatible;
  if (scope === "skills") return isSkill;
  return !isSkill && !evidence.compatible;
}

export function catalogScopeCounts(
  document: RankingsDocument,
  skillsDocument?: RankingsDocument,
): CatalogScopeCounts {
  const counts: CatalogScopeCounts = { plugins: 0, skills: 0, ecosystem: 0 };
  const uniqueEntries = new Map([
    ...document.rankings.total,
    ...(skillsDocument?.rankings.total ?? []),
  ].map((entry) => [entry.fullName.toLowerCase(), entry]));
  for (const entry of uniqueEntries.values()) {
    if (entryMatchesCatalogScope(entry, "plugins")) counts.plugins += 1;
    else if (entryMatchesCatalogScope(entry, "skills")) counts.skills += 1;
    else if (entryMatchesCatalogScope(entry, "ecosystem")) counts.ecosystem += 1;
  }
  return counts;
}

export async function loadCatalogMetadata(
  dataUrl: string,
  force = false,
): Promise<{
  scopeCounts: CatalogScopeCounts;
  pluginCategories: PluginCategoryDefinition[];
}> {
  const baseUrl = normalizeDataUrl(dataUrl);
  try {
    const manifest = await loadRankingManifest(baseUrl, force);
    const mixedSkillCount = manifest.datasets.total.skillCount ?? 0;
    return {
      scopeCounts: {
        plugins: Math.max(0, manifest.datasets.total.count - mixedSkillCount),
        skills: manifest.datasets.skills?.count ?? mixedSkillCount,
        ecosystem: 0,
      },
      pluginCategories: manifestPluginCategories(manifest),
    };
  } catch {
    const [pluginResult, skillsResult] = await Promise.allSettled([
      loadSearchRankings(baseUrl, force),
      loadSkillRankings(baseUrl, force),
    ]);
    let reference: RankingsDocument;
    if (pluginResult.status === "fulfilled") reference = pluginResult.value;
    else if (skillsResult.status === "fulfilled") reference = skillsResult.value;
    else throw pluginResult.reason;
    const pluginDirectory = pluginResult.status === "fulfilled"
      ? pluginResult.value
      : {
          ...reference,
          categories: [],
          rankings: { total: [], hot: [], rising: [] },
        };
    const skillsDirectory = skillsResult.status === "fulfilled"
      ? skillsResult.value
      : {
          ...reference,
          categories: [],
          rankings: { total: [], hot: [], rising: [] },
        };
    return {
      scopeCounts: catalogScopeCounts(pluginDirectory, skillsDirectory),
      pluginCategories: filteredCatalogCategories(pluginDirectory, {
        excludeSkills: true,
        compatibleOnly: true,
        catalogScope: "plugins",
      }),
    };
  }
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
    compatibleOnly?: boolean;
    catalogScope?: CatalogScope;
    installAvailability?: InstallAvailability;
  },
): { total: number; excludedSkillCount: number; items: CatalogItem[] } {
  const hasQuery = tokenizeSearchQuery(options.query).length > 0;
  const source = hasQuery || options.view === "total"
    ? document.rankings.total
    : document.rankings[options.view] ?? [];
  const scored = source
    .filter((entry) => !options.compatibleOnly || catalogEvidence(entry).compatible)
    .filter((entry) => !options.catalogScope || entryMatchesCatalogScope(entry, options.catalogScope))
    .filter((entry) => options.category === null || entryMatchesCategory(entry, options.category))
    .filter((entry) => {
      if (!options.installAvailability || options.installAvailability === "all") return true;
      const installable = resolveInstallSpec(entry) !== null;
      return options.installAvailability === "installable" ? installable : !installable;
    })
    .map((entry) => ({ entry, score: scoreSearchEntry(entry, options.query) }))
    .filter((item): item is { entry: RankingEntry; score: number } => item.score !== null);
  const excludedSkillCount = options.excludeSkills
    ? scored.filter(({ entry }) => entry.type?.toLowerCase() === "skill").length
    : 0;
  const visible = options.excludeSkills
    ? scored.filter(({ entry }) => entry.type?.toLowerCase() !== "skill")
    : scored;
  if (hasQuery) {
    visible.sort((left, right) => right.score - left.score || left.entry.rank - right.entry.rank);
  }
  const matched = visible.map(({ entry }) => annotate(entry, options.installed));
  return {
    total: matched.length,
    excludedSkillCount,
    items: matched.slice(options.offset, options.offset + options.limit),
  };
}

export function filteredCatalogCategories(
  document: RankingsDocument,
  options: { excludeSkills?: boolean; compatibleOnly?: boolean; catalogScope?: CatalogScope },
): CatalogCategoryDefinition[] {
  const definitions = catalogCategories(document);
  const stats = new Map(definitions.map(({ id }) => [id, { count: 0, excludedSkillCount: 0 }]));
  for (const entry of document.rankings.total) {
    if (options.compatibleOnly && !catalogEvidence(entry).compatible) continue;
    if (options.catalogScope && !entryMatchesCatalogScope(entry, options.catalogScope)) continue;
    const excluded = Boolean(options.excludeSkills && entry.type?.toLowerCase() === "skill");
    const categoryIds = new Set(
      (entry.categories ?? []).map((assignment) =>
        typeof assignment === "string" ? assignment : assignment?.id
      ),
    );
    for (const categoryId of categoryIds) {
      const category = stats.get(categoryId as PluginCategoryId);
      if (!category) continue;
      if (excluded) category.excludedSkillCount += 1;
      else category.count += 1;
    }
  }
  return definitions.map((definition) => ({
    ...definition,
    ...stats.get(definition.id)!,
  }));
}

export function invalidateCatalog(): void {
  caches.clear();
  fallbackReasons.clear();
  manifestCaches.clear();
  manifestInFlight.clear();
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

function manifestCachePath(dataUrl: string): string {
  const key = createHash("sha256").update(`${dataUrl}/manifest.json`).digest("hex").slice(0, 24);
  return join(catalogCacheDirectory(), `${key}.manifest.json`);
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

async function readManifestDiskCache(dataUrl: string): Promise<RankingManifestCache | null> {
  try {
    const payload = JSON.parse(await readFile(manifestCachePath(dataUrl), "utf8")) as Partial<RankingManifestDiskCache>;
    if (payload.schemaVersion !== 1
      || payload.dataUrl !== dataUrl
      || !Number.isFinite(payload.fetchedAt)
      || !payload.manifest
    ) return null;
    const manifest = parseRankingManifest(JSON.stringify(payload.manifest));
    for (const reference of manifestReferences(manifest)) manifestFileUrl(dataUrl, reference);
    return { fetchedAt: Number(payload.fetchedAt), manifest };
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

async function writeManifestDiskCache(
  dataUrl: string,
  value: RankingManifestCache,
): Promise<void> {
  const path = manifestCachePath(dataUrl);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await mkdir(catalogCacheDirectory(), { recursive: true });
    const payload: RankingManifestDiskCache = { schemaVersion: 1, dataUrl, ...value };
    await writeFile(temporary, `${JSON.stringify(payload)}\n`, "utf8");
    try {
      await rename(temporary, path);
    } catch {
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

function manifestReferences(manifest: RankingManifestV2): RankingFileReferenceV2[] {
  return [
    manifest.datasets.hot,
    manifest.datasets.rising,
    ...(manifest.datasets.skills ? [manifest.datasets.skills] : []),
    manifest.datasets.search,
    ...manifest.datasets.total.pages,
    ...manifest.categories.flatMap((category) => category.pages),
  ];
}

async function downloadRankingManifest(baseUrl: string): Promise<RankingManifestV2> {
  const url = `${baseUrl}/manifest.json`;
  let raw: string;
  try {
    raw = await fetchCatalogText(url);
  } catch (error) {
    if (process.platform === "win32" && isRetryableCatalogFetchError(error)) {
      raw = await fetchCatalogTextWindows(url);
    } else {
      throw error;
    }
  }
  const manifest = parseRankingManifest(raw);
  for (const reference of manifestReferences(manifest)) manifestFileUrl(baseUrl, reference);
  const value = { fetchedAt: Date.now(), manifest };
  manifestCaches.set(baseUrl, value);
  await writeManifestDiskCache(baseUrl, value);
  fallbackReasons.delete(url);
  return manifest;
}

function refreshRankingManifest(baseUrl: string): Promise<RankingManifestV2> {
  const pending = manifestInFlight.get(baseUrl);
  if (pending) return pending;
  const task = downloadRankingManifest(baseUrl);
  manifestInFlight.set(baseUrl, task);
  const cleanup = (): void => {
    if (manifestInFlight.get(baseUrl) === task) manifestInFlight.delete(baseUrl);
  };
  void task.then(cleanup, cleanup);
  return task;
}

export async function loadRankingManifest(
  dataUrl: string,
  force = false,
): Promise<RankingManifestV2> {
  const baseUrl = normalizeDataUrl(dataUrl);
  const cached = manifestCaches.get(baseUrl) ?? await readManifestDiskCache(baseUrl);
  if (cached) manifestCaches.set(baseUrl, cached);
  if (!force && cached) {
    if (Date.now() - cached.fetchedAt >= CACHE_MS) {
      void refreshRankingManifest(baseUrl).catch((error: unknown) => {
        fallbackReasons.set(`${baseUrl}/manifest.json`, describeCatalogFetchError(error));
      });
    }
    return cached.manifest;
  }
  return refreshRankingManifest(baseUrl);
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

export function parseSkillDirectoryDocument(raw: string): RankingsDocument {
  let payload: Omit<RankingsDocument, "rankings"> & { rankings: RankingEntry[] };
  try { payload = JSON.parse(raw) as typeof payload; }
  catch { throw new CatalogSourceError("Skills 目录不是有效 JSON", { fallbackToFull: true }); }
  if (!Array.isArray(payload?.rankings)) {
    throw new CatalogSourceError("Skills 目录缺少 rankings", { fallbackToFull: true });
  }
  return {
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    snapshotDate: payload.snapshotDate,
    definitions: payload.definitions,
    categories: payload.categories,
    rankings: { total: payload.rankings, hot: [], rising: [] },
  };
}

function normalizeSearchEntry(value: unknown, index: number): RankingEntry | null {
  if (value === null || typeof value !== "object") return null;
  const entry = value as Partial<RankingEntry> & { installTarget?: unknown };
  if (typeof entry.fullName !== "string") return null;
  const [owner = "", repositoryName = entry.fullName] = entry.fullName.split("/");
  const parsedTarget = typeof entry.installTarget === "string"
    ? parseInstallSpec(entry.installTarget)
    : null;
  const install = entry.install ?? (parsedTarget ? {
    method: "manifest-v2",
    target: parsedTarget.spec,
    commands: [`dsh plugin add ${parsedTarget.spec}`],
    commandSource: "manifest-v2",
  } : undefined);
  return {
    rank: Number.isFinite(entry.rank) ? Number(entry.rank) : index + 1,
    totalRank: Number.isFinite(entry.totalRank) ? Number(entry.totalRank) : undefined,
    fullName: entry.fullName,
    name: typeof entry.name === "string" ? entry.name : repositoryName,
    owner: typeof entry.owner === "string" ? entry.owner : owner,
    description: typeof entry.description === "string" ? entry.description : "",
    descriptionZh: typeof entry.descriptionZh === "string" ? entry.descriptionZh : "",
    ...(typeof entry.readmeSummary === "string" ? { readmeSummary: entry.readmeSummary } : {}),
    stars: Number(entry.stars) || 0,
    dailyStars: Number(entry.dailyStars) || 0,
    weeklyStars: Number(entry.weeklyStars) || 0,
    hotScore: Number(entry.hotScore) || 0,
    forks: Number(entry.forks) || 0,
    openIssues: Number(entry.openIssues) || 0,
    language: typeof entry.language === "string" ? entry.language : null,
    homepage: typeof entry.homepage === "string" ? entry.homepage : null,
    license: typeof entry.license === "string" ? entry.license : null,
    topics: Array.isArray(entry.topics) ? entry.topics.filter((item): item is string => typeof item === "string") : [],
    tags: Array.isArray(entry.tags) ? entry.tags.filter((item): item is string => typeof item === "string") : [],
    categories: entry.categories,
    type: typeof entry.type === "string" ? entry.type : "candidate",
    install,
    sources: Array.isArray(entry.sources) ? entry.sources.filter((item): item is string => typeof item === "string") : [],
    url: typeof entry.url === "string" ? entry.url : `https://github.com/${entry.fullName}`,
    pushedAt: typeof entry.pushedAt === "string" ? entry.pushedAt : "",
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
  };
}

export function parseRankingSearchDocument(raw: string): RankingsDocument {
  let payload: Omit<RankingsDocument, "rankings"> & { rankings: unknown[] };
  try { payload = JSON.parse(raw) as typeof payload; }
  catch { throw new CatalogSourceError("榜单检索索引不是有效 JSON", { fallbackToFull: true }); }
  if (!Array.isArray(payload?.rankings)) {
    throw new CatalogSourceError("榜单检索索引缺少 rankings", { fallbackToFull: true });
  }
  const entries = payload.rankings
    .map(normalizeSearchEntry)
    .filter((entry): entry is RankingEntry => entry !== null);
  if (entries.length !== payload.rankings.length) {
    throw new CatalogSourceError("榜单检索索引包含无效条目", { fallbackToFull: true });
  }
  return {
    schemaVersion: payload.schemaVersion,
    generatedAt: payload.generatedAt,
    snapshotDate: payload.snapshotDate,
    definitions: payload.definitions,
    categories: payload.categories,
    rankings: { total: entries, hot: [], rising: [] },
  };
}

function parseSnapshotPayload(
  raw: string,
  manifest: RankingManifestV2,
  dataset: "hot" | "rising" | "skills" | "search" | "total",
): { rankings: RankingEntry[] } {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new CatalogSourceError("榜单快照不是有效 JSON", { fallbackToFull: true }); }
  if (!isRecord(value)
    || value.schemaVersion !== 2
    || value.snapshotId !== manifest.snapshotId
    || value.dataset !== dataset
    || !Array.isArray(value.rankings)
  ) {
    throw new CatalogSourceError("榜单快照与 manifest 不匹配", { fallbackToFull: true });
  }
  const rankings = value.rankings
    .map(normalizeSearchEntry)
    .filter((entry): entry is RankingEntry => entry !== null);
  if (rankings.length !== value.rankings.length) {
    throw new CatalogSourceError("榜单快照包含无效条目", { fallbackToFull: true });
  }
  return { rankings };
}

function snapshotDocument(
  raw: string,
  manifest: RankingManifestV2,
  dataset: "hot" | "rising" | "skills" | "search" | "total",
): RankingsDocument {
  const { rankings } = parseSnapshotPayload(raw, manifest, dataset);
  return {
    schemaVersion: 2,
    generatedAt: manifest.generatedAt,
    snapshotDate: manifest.snapshotDate,
    definitions: manifest.definitions,
    categories: manifestCategories(manifest),
    rankings: {
      total: rankings,
      hot: dataset === "hot" ? rankings : [],
      rising: dataset === "rising" ? rankings : [],
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
  fallbackReasons.delete(url);
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
      void refreshCatalog(url, parser).catch((error: unknown) => {
        fallbackReasons.set(url, describeCatalogFetchError(error));
      });
    }
    return cached.document;
  }
  try {
    return await refreshCatalog(url, parser);
  } catch (error) {
    if (cached && fallbackToCache) {
      fallbackReasons.set(url, describeCatalogFetchError(error));
      return cached.document;
    }
    throw error;
  }
}

async function loadManifestDataset(
  dataUrl: string,
  manifest: RankingManifestV2,
  reference: RankingFileReferenceV2,
  dataset: "hot" | "rising" | "skills" | "search" | "total",
  force = false,
): Promise<RankingsDocument> {
  const url = manifestFileUrl(dataUrl, reference);
  return loadCatalogDocument(url, (raw) => {
    verifySnapshot(raw, reference);
    return snapshotDocument(raw, manifest, dataset);
  }, force);
}

export async function loadRankings(dataUrl: string, force = false): Promise<RankingsDocument> {
  const url = `${normalizeDataUrl(dataUrl)}/rankings.json`;
  return loadCatalogDocument(url, parseRankingsDocument, force);
}

/** Load the compact all-entry index used by total/category/search views. */
export async function loadSearchRankings(dataUrl: string, force = false): Promise<RankingsDocument> {
  const baseUrl = normalizeDataUrl(dataUrl);
  const url = `${baseUrl}/rankings-search.json`;
  let manifestError: unknown = null;
  try {
    const manifest = await loadRankingManifest(baseUrl, force);
    return await loadManifestDataset(baseUrl, manifest, manifest.datasets.search, "search", force);
  } catch (error) {
    manifestError = error;
  }
  try {
    const document = await loadCatalogDocument(url, parseRankingSearchDocument, force);
    fallbackReasons.set(url, `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`);
    return document;
  } catch (error) {
    try {
      const document = await loadRankings(baseUrl, force);
      const fullUrl = `${baseUrl}/rankings.json`;
      const fullReason = fallbackReasons.get(fullUrl);
      fallbackReasons.set(fullUrl, [
        `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`,
        `轻量检索索引不可用：${describeCatalogFetchError(error)}`,
        fullReason,
      ].filter(Boolean).join("；"));
      return document;
    } catch (fallbackError) {
      throw new Error([
        `轻量检索索引不可用：${describeCatalogFetchError(error)}`,
        `完整榜单回退失败：${describeCatalogFetchError(fallbackError)}`,
      ].join("；"));
    }
  }
}

/** Load Skills as a separate discovery directory. Skills never participate in Plugin ranks. */
export async function loadSkillRankings(dataUrl: string, force = false): Promise<RankingsDocument> {
  const baseUrl = normalizeDataUrl(dataUrl);
  const url = `${baseUrl}/rankings-skills.json`;
  let manifestError: unknown = null;
  try {
    const manifest = await loadRankingManifest(baseUrl, force);
    if (!manifest.datasets.skills) {
      throw new CatalogSourceError("榜单 manifest 尚未提供 Skills 目录", { fallbackToFull: true });
    }
    return await loadManifestDataset(baseUrl, manifest, manifest.datasets.skills, "skills", force);
  } catch (error) {
    manifestError = error;
  }
  try {
    const document = await loadCatalogDocument(url, parseSkillDirectoryDocument, force);
    fallbackReasons.set(url, `manifest v2 Skills 目录不可用：${describeCatalogFetchError(manifestError)}`);
    return document;
  } catch (error) {
    const legacy = await loadRankings(baseUrl, force);
    return {
      ...legacy,
      rankings: {
        total: legacy.rankings.total.filter((entry) => entry.type?.toLowerCase() === "skill"),
        hot: [],
        rising: [],
      },
    };
  }
}

export async function catalogCacheStatus(
  dataUrl: string,
  dataset: CatalogCacheStatus["dataset"],
  view?: "hot" | "rising",
): Promise<CatalogCacheStatus> {
  const baseUrl = normalizeDataUrl(dataUrl);
  const manifestCache = manifestCaches.get(baseUrl) ?? await readManifestDiskCache(baseUrl);
  if (manifestCache) manifestCaches.set(baseUrl, manifestCache);
  const manifest = manifestCache?.manifest;
  const candidates: Array<{ url: string; dataset: CatalogCacheStatus["dataset"] }> = [];
  if (manifest && dataset === "view-shard" && view) {
    candidates.push({ url: manifestFileUrl(baseUrl, manifest.datasets[view]), dataset });
  } else if (manifest && dataset === "search-index") {
    candidates.push({ url: manifestFileUrl(baseUrl, manifest.datasets.search), dataset });
  } else if (manifest && dataset === "skill-directory" && manifest.datasets.skills) {
    candidates.push({ url: manifestFileUrl(baseUrl, manifest.datasets.skills), dataset });
  }
  if (dataset === "view-shard" && view) {
    candidates.push({ url: `${baseUrl}/rankings-${view}.json`, dataset });
  } else if (dataset === "search-index") {
    candidates.push({ url: `${baseUrl}/rankings-search.json`, dataset });
  } else if (dataset === "skill-directory") {
    candidates.push({ url: `${baseUrl}/rankings-skills.json`, dataset });
  }
  candidates.push({ url: `${baseUrl}/rankings.json`, dataset: "full-catalog" });
  for (const candidate of candidates) {
    const cached = await cachedCatalog(candidate.url);
    if (!cached) continue;
    const ageMs = Math.max(0, Date.now() - cached.fetchedAt);
    return {
      fetchedAt: cached.fetchedAt,
      ageMs,
      stale: ageMs >= CACHE_MS,
      reason: fallbackReasons.get(candidate.url) ?? null,
      source: "network-or-cache",
      dataset: candidate.dataset,
    };
  }
  return { fetchedAt: null, ageMs: null, stale: false, reason: null, source: "unknown", dataset };
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
  const manifestCache = manifestCaches.get(baseUrl) ?? await readManifestDiskCache(baseUrl);
  if (manifestCache) manifestCaches.set(baseUrl, manifestCache);
  const manifest = manifestCache?.manifest;
  const urls = manifest ? [
    manifestFileUrl(baseUrl, manifest.datasets.search),
    manifestFileUrl(baseUrl, manifest.datasets.hot),
    manifestFileUrl(baseUrl, manifest.datasets.rising),
    ...(manifest.datasets.skills ? [manifestFileUrl(baseUrl, manifest.datasets.skills)] : []),
  ] : [];
  urls.push(
    `${baseUrl}/rankings-search.json`,
    `${baseUrl}/rankings-hot.json`,
    `${baseUrl}/rankings-rising.json`,
    `${baseUrl}/rankings.json`,
  );
  for (const url of urls) {
    const cached = await cachedCatalog(url);
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
  forceManifest = true,
): Promise<RankingEntry | undefined> {
  const baseUrl = normalizeDataUrl(dataUrl);
  try {
    const manifest = await loadRankingManifest(baseUrl, forceManifest);
    const search = await loadManifestDataset(
      baseUrl,
      manifest,
      manifest.datasets.search,
      "search",
    );
    const indexed = findEntry(search, fullName);
    if (!indexed) {
      const skills = await loadSkillRankings(baseUrl);
      return findEntry(skills, fullName);
    }
    const pageNumber = Math.floor((indexed.rank - 1) / manifest.datasets.total.pageSize) + 1;
    const pageReference = manifest.datasets.total.pages.find((page) => page.page === pageNumber);
    if (!pageReference) {
      throw new CatalogSourceError("榜单 manifest 缺少插件对应的总榜分页", { fallbackToFull: true });
    }
    const page = await loadManifestDataset(baseUrl, manifest, pageReference, "total");
    const entry = findEntry(page, fullName);
    if (!entry) {
      throw new CatalogSourceError("搜索索引与总榜分页不一致", { fallbackToFull: true });
    }
    return entry;
  } catch (error) {
    fallbackReasons.set(`${baseUrl}/manifest.json`, `安装校验回退旧目录：${describeCatalogFetchError(error)}`);
  }

  const fullUrl = `${baseUrl}/rankings.json`;
  const [full, hot, rising, search] = await Promise.all([
    cachedCatalog(fullUrl),
    cachedCatalog(`${baseUrl}/rankings-hot.json`),
    cachedCatalog(`${baseUrl}/rankings-rising.json`),
    cachedCatalog(`${baseUrl}/rankings-search.json`),
  ]);
  const newestShardTime = Math.max(
    ...[hot, rising, search].filter((value): value is CatalogCache => value !== null).map(catalogSnapshotTime),
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
  let manifestError: unknown = null;
  try {
    const manifest = await loadRankingManifest(baseUrl, force);
    return await loadManifestDataset(baseUrl, manifest, manifest.datasets[view], view, force);
  } catch (error) {
    manifestError = error;
  }
  try {
    const document = await loadCatalogDocument(url, (raw) => parseRankingViewDocument(raw, view), force);
    fallbackReasons.set(url, `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`);
    return document;
  } catch (error) {
    if (error instanceof CatalogSourceError && error.fallbackToFull) {
      const document = await loadRankings(baseUrl, force);
      const fullUrl = `${baseUrl}/rankings.json`;
      const fullReason = fallbackReasons.get(fullUrl);
      fallbackReasons.set(fullUrl, [
        `manifest v2 不可用：${describeCatalogFetchError(manifestError)}`,
        `${view} 分片不可用：${describeCatalogFetchError(error)}`,
        fullReason,
      ].filter(Boolean).join("；"));
      return document;
    }
    throw error;
  }
}

export function findEntry(document: RankingsDocument, fullName: string): RankingEntry | undefined {
  const needle = fullName.toLowerCase();
  return document.rankings.total.find((entry) => entry.fullName.toLowerCase() === needle);
}
