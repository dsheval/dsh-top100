import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  catalogCacheStatus, invalidateCatalog, loadCachedRankings, loadRankingManifest, loadRankingView,
  loadRankings, loadSearchRankings, loadSkillRankings, parseRankingSearchDocument,
} from "../src/host/catalog.js";
import { descriptionFor, PENDING_DESCRIPTION_ZH } from "../src/shared/description-rules.js";

const BASE = "https://cache.example/data";
const originalCacheDirectory = process.env.DSH_TOP100_CACHE_DIR;
let directory: string;

function publication(revision: number, descriptionZh: string, status?: unknown) {
  const snapshotId = `description-${revision}`;
  const generatedAt = `2026-09-16T0${revision}:00:00.000Z`;
  const item = {
    fullName: "acme/plugin", name: "plugin", rank: 1, totalRank: 1,
    description: "作者原始旧简介，不可回填。", descriptionZh, descriptionPolicy: "server-v1",
    ...(status === undefined ? {} : { descriptionStatus: status }),
    type: "cordis-plugin", stars: 10,
  };
  const base = { schemaVersion: 2, snapshotId, generatedAt, snapshotDate: "2026-09-16" };
  const responses = new Map<string, string>();
  const reference = (dataset: string) => {
    const raw = JSON.stringify({ ...base, dataset, rankings: [item] });
    const url = `/data/snapshots/${snapshotId}/${dataset}.json`;
    responses.set(`https://cache.example${url}`, raw);
    return { url, count: 1, bytes: Buffer.byteLength(raw), sha256: createHash("sha256").update(raw).digest("hex") };
  };
  const manifest = { ...base, pageSize: 100, categories: [], datasets: {
    hot: reference("hot"), rising: reference("rising"), skills: reference("skills"), search: reference("search"),
    total: { count: 1, pageSize: 100, pageCount: 1, pages: [{ ...reference("total"), page: 1 }] },
  } };
  responses.set(`${BASE}/manifest.json`, JSON.stringify(manifest));
  const full = { ...base, rankings: { total: [item], hot: [item], rising: [item] } };
  responses.set(`${BASE}/rankings.json`, JSON.stringify(full));
  for (const kind of ["hot", "rising", "search", "skills"]) {
    responses.set(`${BASE}/rankings-${kind}.json`, JSON.stringify({ ...base, rankings: [item] }));
  }
  return { manifest, responses, full };
}

function serve(responses: Map<string, string>) {
  const mock = vi.fn(async (input: string | URL | Request) => {
    const raw = responses.get(String(input));
    return raw === undefined ? new Response("not found", { status: 404 }) : new Response(raw);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "dsh-description-cache-"));
  process.env.DSH_TOP100_CACHE_DIR = directory;
  invalidateCatalog();
});
afterEach(async () => {
  invalidateCatalog();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalCacheDirectory === undefined) delete process.env.DSH_TOP100_CACHE_DIR;
  else process.env.DSH_TOP100_CACHE_DIR = originalCacheDirectory;
  await rm(directory, { recursive: true, force: true });
});

describe("published descriptions across catalog refresh and persistent caches", () => {
  it.each([
    { label: "ordinary revision", text: "服务端新修订，插件安装包没有变化。", status: undefined },
    { label: "approved stale revision", text: "上次已核实的旧简介。", status: { state: "stale", reviewedAt: "2026-09-16", reason: "来源核查中" } },
    { label: "model stale revision", text: "旧模型生成简介仍保留。", status: { state: "stale", origin: "model", generatedAt: "2026-09-16", reason: "来源待核查" } },
    { label: "empty withdrawal", text: "", status: undefined },
    { label: "review required", text: "已撤回的旧中文不能恢复。", status: { state: "review-required", reason: "来源变化" } },
  ])("updates $label on the first request after the existing 30-minute interval", async ({ text, status }) => {
    const old = publication(1, "服务端旧介绍。");
    serve(old.responses);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    expect(descriptionFor((await loadRankingView(BASE, "hot")).rankings.hot[0])).toBe("服务端旧介绍。");
    const next = publication(2, text, status);
    const fetchMock = serve(next.responses);
    clock.mockReturnValue(now + 30 * 60 * 1000 + 1);
    const current = await loadRankingView(BASE, "hot");
    expect(current.snapshotId).toBe(next.manifest.snapshotId);
    if (status?.state === "stale") expect(current.rankings.hot[0].descriptionStatus).toEqual(status);
    expect(descriptionFor(current.rankings.hot[0])).toBe(status && status.state !== "stale" || !text ? PENDING_DESCRIPTION_ZH : text);
    expect(descriptionFor((await loadSearchRankings(BASE)).rankings.total[0])).toBe(descriptionFor(current.rankings.hot[0]));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain(`${BASE}/rankings.json`);
    invalidateCatalog();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(descriptionFor((await loadCachedRankings(BASE))!.rankings.total[0])).toBe(descriptionFor(current.rankings.hot[0]));
    expect(descriptionFor((await loadSearchRankings(BASE, true)).rankings.total[0])).toBe(descriptionFor(current.rankings.hot[0]));
  });

  it("shares a forced manifest refresh with simultaneous fresh-cache readers across all views", async () => {
    serve(publication(1, "旧简介。").responses);
    await Promise.all([loadRankingView(BASE, "hot"), loadRankingView(BASE, "rising"), loadSearchRankings(BASE)]);
    const next = publication(2, "");
    const fetchMock = serve(next.responses);
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const requests = Promise.all([
      loadRankingView(BASE, "hot", true), loadRankingView(BASE, "rising"), loadSearchRankings(BASE),
    ]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    release(new Response(JSON.stringify(next.manifest)));
    for (const document of await requests) {
      expect(document.snapshotId).toBe(next.manifest.snapshotId);
      expect(descriptionFor(document.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
    }
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/manifest.json"))).toHaveLength(1);
  });

  it("shares a forced full-catalog refresh with simultaneous fresh-cache readers", async () => {
    serve(publication(1, "旧简介。").responses);
    await loadRankings(BASE);
    const next = publication(2, "");
    const fetchMock = serve(next.responses);
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const requests = Promise.all([loadRankings(BASE, true), loadRankings(BASE)]);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release(new Response(JSON.stringify(next.full)));
    for (const document of await requests) {
      expect(document.snapshotId).toBe(next.manifest.snapshotId);
      expect(descriptionFor(document.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["hot", "search", "skills"] as const)("never revives legacy %s content after observing a newer manifest", async (dataset) => {
    const old = publication(1, "旧完整榜单中的有效简介。");
    serve(old.responses);
    await loadRankings(BASE);
    await loadSearchRankings(BASE);
    const next = publication(2, "");
    const responses = new Map(old.responses);
    responses.set(`${BASE}/manifest.json`, JSON.stringify(next.manifest));
    const fetchMock = serve(responses);
    const loader = dataset === "hot" ? () => loadRankingView(BASE, "hot", true)
      : dataset === "skills" ? () => loadSkillRankings(BASE, true) : () => loadSearchRankings(BASE, true);
    await expect(loader()).rejects.toThrow(/404/);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${BASE}/manifest.json`, `https://cache.example${next.manifest.datasets[dataset].url}`,
    ]);
    expect(await loadCachedRankings(BASE)).toBeNull();
    invalidateCatalog();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await loadCachedRankings(BASE)).toBeNull();
    await expect(loader()).rejects.toThrow(/offline/);
  });

  it("reports manifest refresh failure even when the current snapshot shard downloads successfully", async () => {
    const current = publication(2, "");
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    serve(current.responses);
    await loadRankingManifest(BASE);
    const fetchMock = serve(current.responses);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith("/manifest.json")) throw new Error("manifest offline");
      return original(input);
    });
    clock.mockReturnValue(now + 30 * 60 * 1000 + 1);
    await loadSearchRankings(BASE);
    expect(await catalogCacheStatus(BASE, "search-index")).toMatchObject({
      fetchedAt: now + 30 * 60 * 1000 + 1, ageMs: 0, stale: true, reason: "manifest offline", dataset: "search-index",
    });
  });

  it("does not report an old full-catalog cache as the status of a newer missing snapshot", async () => {
    serve(publication(1, "旧榜单。").responses);
    await loadRankings(BASE);
    serve(publication(2, "").responses);
    await loadRankingManifest(BASE, true);
    expect(await catalogCacheStatus(BASE, "search-index")).toMatchObject({
      fetchedAt: null, ageMs: null, source: "unknown", dataset: "search-index",
    });
  });

  it("does not let an older manifest response overwrite a completed refresh after invalidation", async () => {
    const old = publication(1, "旧介绍。");
    const next = publication(2, "");
    let release!: (response: Response) => void;
    const fetchMock = serve(next.responses);
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const pending = loadRankingManifest(BASE, true);
    const outcome = expect(pending).rejects.toThrow(/缓存已刷新/);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    invalidateCatalog();
    await loadRankingView(BASE, "hot", true);
    release(new Response(JSON.stringify(old.manifest)));
    await outcome;
    expect((await loadRankingManifest(BASE)).snapshotId).toBe(next.manifest.snapshotId);
    invalidateCatalog();
    expect((await loadCachedRankings(BASE))!.snapshotId).toBe(next.manifest.snapshotId);
  });

  it("rejects a late old dataset response after another request observed the withdrawal", async () => {
    const old = publication(1, "旧介绍。");
    const next = publication(2, "");
    let release!: (response: Response) => void;
    const fetchMock = serve(old.responses);
    await loadRankingManifest(BASE);
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const pending = loadRankingView(BASE, "hot");
    const outcome = expect(pending).rejects.toThrow(/快照已更新/);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    serve(next.responses);
    await loadSearchRankings(BASE, true);
    release(new Response(old.responses.get(`https://cache.example${old.manifest.datasets.hot.url}`)));
    await outcome;
    expect(descriptionFor((await loadCachedRankings(BASE))!.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
  });

  it("does not restore a captured full-catalog cache after a concurrent invalidation and newer refresh", async () => {
    const old = publication(1, "旧完整榜单介绍。");
    const next = publication(2, "");
    const fetchMock = serve(old.responses);
    await loadRankings(BASE);
    let release!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
    const pending = loadRankings(BASE, true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    invalidateCatalog();
    serve(next.responses);
    await loadRankings(BASE, true);
    release(new Response(JSON.stringify(old.full)));
    expect((await pending).snapshotId).toBe(next.manifest.snapshotId);
    invalidateCatalog();
    expect(descriptionFor((await loadCachedRankings(BASE))!.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
  });

  it("uses the newest legacy cache for local management rather than preferring an older search index", async () => {
    const old = publication(1, "旧搜索简介。");
    old.responses.delete(`${BASE}/manifest.json`);
    serve(old.responses);
    await loadSearchRankings(BASE);
    serve(publication(2, "").responses);
    await loadRankings(BASE, true);
    invalidateCatalog();
    const cached = await loadCachedRankings(BASE);
    expect(cached!.snapshotId).toBe("description-2");
    expect(descriptionFor(cached!.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
  });

  it("refuses a server rollback and keeps the last observed withdrawn snapshot offline", async () => {
    const next = publication(2, "");
    serve(next.responses);
    await loadSearchRankings(BASE);
    serve(publication(1, "旧介绍。").responses);
    const current = await loadSearchRankings(BASE, true);
    expect(current.snapshotId).toBe(next.manifest.snapshotId);
    expect(descriptionFor(current.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
  });

  it("rejects a disk document whose snapshot does not match its current manifest URL", async () => {
    const next = publication(2, "");
    serve(next.responses);
    await loadRankingManifest(BASE);
    const url = `https://cache.example${next.manifest.datasets.search.url}`;
    const key = createHash("sha256").update(url).digest("hex").slice(0, 24);
    await writeFile(join(directory, `${key}.json`), JSON.stringify({ schemaVersion: 2, dataUrl: url,
      fetchedAt: Date.now(), document: publication(1, "旧介绍。").full }));
    expect(await loadCachedRankings(BASE)).toBeNull();
    await expect(loadSearchRankings(BASE)).rejects.toThrow(/快照已更新/);
  });

  it("retains legacy lists when the manifest is absent while hiding unmarked legacy descriptions", async () => {
    const legacy = publication(1, "未经过服务端最终发布的旧中文。");
    const raw = JSON.parse(legacy.responses.get(`${BASE}/rankings-search.json`)!);
    delete raw.rankings[0].descriptionPolicy;
    serve(new Map([[`${BASE}/rankings-search.json`, JSON.stringify(raw)]]));
    const document = await loadSearchRankings(BASE);
    expect(document.rankings.total).toHaveLength(1);
    expect(descriptionFor(document.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
  });

  it.each([null, false, {}, { state: "published", reason: "invalid" }])("fails closed for malformed provided description status %j", (status) => {
    const payload = publication(1, "不应复活的旧中文。", status);
    const document = parseRankingSearchDocument(payload.responses.get(`${BASE}/rankings-search.json`)!);
    expect(document.rankings.total[0].descriptionStatus?.state).toBe("review-required");
    expect(descriptionFor(document.rankings.total[0])).toBe(PENDING_DESCRIPTION_ZH);
  });
});
