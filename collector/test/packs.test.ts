/**
 * packs 通道单元测试：清单解析 / 特征检测 / 组装
 */
import { describe, expect, it } from "vitest";
import {
  parsePackManifest,
  detectPack,
  buildPack,
} from "../src/packs.js";
import type { GithubRepo } from "../src/github.js";

const PROTOCOL_PACK = JSON.stringify({
  schemaVersion: 1,
  kind: "dsh-pack",
  name: "翻译工作流包",
  description: "一键装好翻译全家桶",
  author: "2BingLing",
  plugins: [
    { id: "owner/repo", type: "skill", version: "latest" },
    { id: "npm-pkg-name", type: "cordis", version: ">=1.2.0" },
    { id: "bundle-id", type: "bundle", version: "2026-08-15" },
  ],
  config: {},
  ext: { anything: true },
});

describe("parsePackManifest", () => {
  it("解析协议 v0.1 格式", () => {
    const m = parsePackManifest(PROTOCOL_PACK, "dsh.pack.json");
    expect(m).not.toBeNull();
    expect(m!.schemaVersion).toBe(1);
    expect(m!.kind).toBe("dsh-pack");
    expect(m!.name).toBe("翻译工作流包");
    expect(m!.entries).toHaveLength(3);
    expect(m!.entries[0]).toEqual({ id: "owner/repo", type: "skill", version: "latest" });
    expect(m!.entries[1]).toEqual({ id: "npm-pkg-name", type: "cordis", version: ">=1.2.0" });
    expect(m!.entries[2]).toEqual({ id: "bundle-id", type: "bundle", version: "2026-08-15" });
    // 未知字段（config/ext）被忽略，不报错——前向兼容铁律
    expect(m!.warnings).toHaveLength(0);
  });

  it("非 JSON 返回 null", () => {
    expect(parsePackManifest("not json {", "pack.json")).toBeNull();
  });

  it("无 plugins 数组返回 null（不是包清单）", () => {
    expect(parsePackManifest('{"name":"x"}', "dsh.pack.json")).toBeNull();
    expect(parsePackManifest('{"plugins":"not-array"}', "dsh.pack.json")).toBeNull();
  });

  it("未知条目类型 → 警告 + 按 id 形态推断，不中断", () => {
    const m = parsePackManifest(
      JSON.stringify({
        plugins: [
          { id: "a/b", type: "weird", version: "latest" },
          { id: "npm-only", type: "mystery" },
          { id: "", type: "skill" },
        ],
      }),
      "pack.json"
    );
    expect(m).not.toBeNull();
    expect(m!.entries).toHaveLength(2);
    expect(m!.entries[0].type).toBe("skill"); // 有 "/" → 按 owner/repo
    expect(m!.entries[1].type).toBe("cordis"); // 无 "/" → 按 npm 包
    expect(m!.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("缺 version 默认 latest", () => {
    const m = parsePackManifest('{"plugins":[{"id":"a/b","type":"skill"}]}', "pack.json");
    expect(m!.entries[0].version).toBe("latest");
  });
});

describe("detectPack", () => {
  const fetchFile = async (path: string) =>
    path === "dsh.pack.json" ? { content: PROTOCOL_PACK, sha: "abc" } : null;

  it("根目录有 dsh.pack.json → 命中", async () => {
    const d = await detectPack("someone/translation-pack", ["README.md", "dsh.pack.json"], fetchFile);
    expect(d).not.toBeNull();
    expect(d!.file).toBe("dsh.pack.json");
    expect(d!.manifest.entries).toHaveLength(3);
  });

  it("只有 pack.json → 命中", async () => {
    const f = async (path: string) =>
      path === "pack.json" ? { content: '{"plugins":[{"id":"x/y","type":"skill"}]}', sha: "s" } : null;
    const d = await detectPack("someone/x", ["pack.json"], f);
    expect(d?.file).toBe("pack.json");
  });

  it("无清单文件 → null", async () => {
    const d = await detectPack("someone/x", ["README.md", "package.json"], fetchFile);
    expect(d).toBeNull();
  });

  it("清单内容非法（无 plugins）→ null", async () => {
    const f = async () => ({ content: '{"name":"x"}', sha: "s" });
    const d = await detectPack("someone/x", ["dsh.pack.json"], f);
    expect(d).toBeNull();
  });
});

describe("buildPack", () => {
  const repo: GithubRepo = {
    id: 1,
    full_name: "someone/translation-pack",
    name: "translation-pack",
    owner: { login: "someone" },
    description: "a pack",
    stargazers_count: 5,
    forks_count: 1,
    open_issues_count: 0,
    language: "TypeScript",
    homepage: null,
    license: { spdx_id: "MIT" },
    topics: ["dsh-plugin"],
    pushed_at: "2026-08-15T00:00:00Z",
    created_at: "2026-08-14T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
    default_branch: "main",
    archived: false,
    fork: false,
  };

  it("组装 DshPack：条目统计 + 标签 + 评分", () => {
    const entries = [
      { id: "a/b", type: "skill" as const, version: "latest",
        resolved: { ok: true, inMarket: true, matchId: "a/b" } },
      { id: "c/d", type: "cordis" as const, version: "latest",
        resolved: { ok: true, inMarket: false, reason: "npm 包不存在" } },
      { id: "e/f", type: "skill" as const, version: "latest",
        resolved: { ok: false, inMarket: false, reason: "GitHub 仓库不存在" } },
    ];
    const manifest = parsePackManifest(
      JSON.stringify({ name: "翻译包", description: "d", author: "me", plugins: [] }),
      "dsh.pack.json"
    )!;
    const pack = buildPack(repo, manifest, entries, "README content", ["pack-known"], 500);
    expect(pack.id).toBe("someone/translation-pack");
    expect(pack.entryStats).toEqual({ total: 3, ok: 2, failed: 1, inMarket: 1 });
    expect(pack.tags).toContain("整合包");
    expect(pack.sources).toContain("pack-known");
    expect(pack.score.total).toBeGreaterThan(0);
    expect(pack.score.explanation).toContain("3 个条目");
    expect(pack.score.explanation).toContain("1 个已在市场收录");
  });
});
