import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDiagnosticReport } from "../src/host/diagnose.js";
import type { RankingsDocument } from "../src/shared/types.js";

const emptyCatalog: RankingsDocument = {
  schemaVersion: 1,
  generatedAt: "2026-08-25T00:00:00.000Z",
  snapshotDate: "2026-08-25",
  rankings: { hot: [], rising: [], total: [] },
};

describe("profile diagnostics", () => {
  it("only scans bundles declared by the current profile", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dsh-top100-diagnose-"));
    writeFileSync(join(directory, "package.json"), JSON.stringify({
      dependencies: {},
      dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"] } },
    }));
    const report = await buildDiagnosticReport("web", { profileDir: directory, document: emptyCatalog });
    expect(report.bundles.map((item) => item.name)).toEqual(["@deepseek-ai/dsh-base"]);
    expect(report.duplicates).toEqual([]);
  });
});
