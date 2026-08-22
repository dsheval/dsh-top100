import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DshPlugin, MarketData } from "@dsh-top100/schema";
import { importMarketData, openDatabase } from "../src/database.js";
import { buildRankings } from "../src/rankings.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function plugin(fullName: string, stars: number): DshPlugin {
  const [owner, name] = fullName.split("/");
  return {
    id: fullName,
    type: "skill",
    name,
    owner,
    repo: name,
    fullName,
    stars,
    forks: 2,
    openIssues: 1,
    language: "TypeScript",
    description: "A useful extension",
    descriptionZh: "为 DeepSeek Harness 提供可验证的测试扩展能力。",
    tags: ["测试"],
    curated: false,
    homepage: null,
    license: "MIT",
    topics: ["dsh-plugin"],
    pushedAt: "2026-08-20T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
    readmeSummary: "Test README summary",
    install: { method: "skills-add", needsConfig: false },
    score: {
      total: 80,
      breakdown: { maintain: 80, practical: 80, popularity: 80, ease: 80, signal: 80 },
      confidence: 1,
      explanation: "test",
    },
    sources: ["test"],
    lastCheckedAt: "2026-08-21T00:00:00Z",
  };
}

function market(plugins: DshPlugin[]): MarketData {
  return { schemaVersion: 2, generatedAt: "2026-08-21T00:00:00Z", plugins };
}

describe("SQLite history and rankings", () => {
  it("ranks rising repositories by daily growth instead of weekly growth or total stars", () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-db-"));
    temporaryDirectories.push(directory);
    const database = openDatabase({ path: join(directory, "market.sqlite") });
    try {
      importMarketData(
        database,
        market([
          plugin("a/growing", 90),
          plugin("b/large", 1000),
          plugin("c/slowing", 10),
        ]),
        { snapshotDate: "2026-08-14" }
      );
      importMarketData(
        database,
        market([
          plugin("a/growing", 100),
          plugin("b/large", 1000),
          plugin("c/slowing", 60),
        ]),
        { snapshotDate: "2026-08-20" }
      );
      importMarketData(
        database,
        market([
          plugin("a/growing", 107),
          plugin("b/large", 1000),
          plugin("c/slowing", 60),
        ]),
        { snapshotDate: "2026-08-21" }
      );

      const rankings = buildRankings(
        database,
        "2026-08-21",
        resolve("../config/ranking.json")
      );
      expect(rankings.rankings.total[0]?.fullName).toBe("b/large");
      expect(rankings.rankings.total).toHaveLength(3);
      expect(rankings.rankings.rising[0]?.fullName).toBe("a/growing");
      expect(rankings.rankings.rising[0]?.dailyStars).toBe(7);
      expect(rankings.rankings.rising[0]?.weeklyStars).toBe(17);
      expect(
        rankings.rankings.rising.findIndex((entry) => entry.fullName === "c/slowing")
      ).toBeGreaterThan(0);
      expect(rankings.rankings.hot[0]?.hotScore).toBeGreaterThan(0);
    } finally {
      database.close();
    }
  });
});
