import { describe, expect, it } from "vitest";
import { resolveInstallSpec } from "../src/install/install-spec.js";
import { parseInstallCommands } from "../../collector/src/install-parse.js";
import { resolveSearchInstallTarget, toSnapshotSearchEntry } from "../../collector/src/search-index.js";
import { resolveInstallTarget } from "../../web/public/catalog-presentation.js";
import { parseRankingSearchDocument } from "../src/host/catalog.js";
import type { RankingEntry } from "../src/shared/types.js";
import type { RankingsDocument } from "../../collector/src/rankings.js";

describe("collector, website and installed plugin use identical source rules", () => {
  it.each([
    ["npx @deepseek-ai/dsh plugin --profile=web add @acme/demo@latest", "@acme/demo@latest"],
    ["dsh --profile web plugin add https://github.com/acme/demo.git#v1", "github:acme/demo#v1"],
    ["dsh plugin add @acme/demo --profile web", "@acme/demo"],
    ["dsh plugin add https://github.com/other/demo", null],
    ["dsh plugin add unrelated-package", null],
    ["dsh plugin add @acme/demo && echo unsafe", null],
    ["dsh plugin add https://github.com/acme/demo?x=1", null],
    ["dsh plugin add ./demo", null],
  ])("preserves target identity through compact publication: %s", (command, expected) => {
    const commands = parseInstallCommands(`## 安装\n\`\`\`sh\n${command}\n\`\`\``).commands;
    const entry = { rank: 1, name: "demo", fullName: "acme/demo", type: "cordis-plugin", categories: [],
      install: { packageName: "@acme/demo", commands, needsConfig: true } };
    expect(resolveInstallTarget(entry)).toBe(expected);
    expect(resolveInstallSpec(entry as RankingEntry)?.spec ?? null).toBe(expected);
    expect(resolveSearchInstallTarget(entry as RankingsDocument["rankings"]["total"][number])).toBe(expected);
    const compact = toSnapshotSearchEntry(entry as RankingsDocument["rankings"]["total"][number]);
    expect(resolveInstallTarget(compact)).toBe(expected);
    const restored = parseRankingSearchDocument(JSON.stringify({ rankings: [compact] })).rankings.total[0];
    expect(resolveInstallSpec(restored)?.spec ?? null).toBe(expected);
    if (expected) expect(restored.install?.needsConfig).toBe(true);
  });
});
