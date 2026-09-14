import { beforeEach, expect, it, vi } from "vitest";
import packages from "./fixtures/hot-two-packages.json";
import descriptions from "../../plugin/src/shared/reviewed-descriptions.json";
import { detectPlugin } from "../src/detect.js";
import { fetchFileViaApi, fetchRepoRoot } from "../src/github.js";
import { reviewedPluginTargets, quarantineUnreviewedTarget } from "../src/reviewed-targets.js";
import { reviewedDescription } from "../src/editorial.js";
import { descriptionFor, PENDING_DESCRIPTION_ZH } from "../../plugin/src/shared/description-rules.js";
import { resolveCatalogInstallTarget } from "../../plugin/src/shared/install-source.js";
import { toSnapshotSearchEntry } from "../src/search-index.js";
vi.mock("../src/github.js", () => ({ fetchFileViaApi: vi.fn(), fetchRepoRoot: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
it.each(packages)("validates $fullName at its observed package path and withholds root installation commands", async fixture => {
  vi.mocked(fetchRepoRoot).mockImplementation(async (_repo, ref, path) => {
    expect(ref).toBe(fixture.commit);
    return path === fixture.repositoryPath ? [{ name: "package.json", path: `${path}/package.json`, type: "file", size: 1 }] : [];
  });
  vi.mocked(fetchFileViaApi).mockImplementation(async (_repo, path, ref) => {
    expect(path).toBe(`${fixture.repositoryPath}/package.json`); expect(ref).toBe(fixture.commit);
    return { content: JSON.stringify(fixture.package), sha: "fixture" };
  });
  const target = reviewedPluginTargets[fixture.fullName.toLowerCase()];
  const result = await detectPlugin(fixture.fullName, [], fixture.commit, { reviewedTarget: target });
  expect(result).toMatchObject({ isPlugin: true, kind: "client", pluginPath: fixture.repositoryPath, packageName: fixture.package.name });
  const review = descriptions[fixture.fullName.toLowerCase() as keyof typeof descriptions];
  const entry = { fullName: fixture.fullName, name: fixture.fullName.split("/")[1], type: "cordis-plugin",
    description: review.sourceDescription, readmeSummary: review.sourceReadme, descriptionZh: null as string | null,
    categories: [], tags: [], topics: [], install: { method: "pnpm-profile", packageName: fixture.package.name, repositoryPath: fixture.repositoryPath } };
  expect(reviewedDescription(entry)).toBe(review.descriptionZh);
  entry.descriptionZh = review.descriptionZh;
  expect(descriptionFor(toSnapshotSearchEntry(entry as never), descriptions)).toBe(review.descriptionZh);
  expect(resolveCatalogInstallTarget(entry)).toBeNull();
  const root = { ...entry, install: { method: "pnpm-profile", packageName: "@deepseek-ai/dsh-root", commands: [`git clone https://github.com/${fixture.fullName}.git`] } };
  const quarantined = quarantineUnreviewedTarget(root as never, target);
  expect(quarantined.install).not.toHaveProperty("commands");
  expect(quarantined.install).not.toHaveProperty("packageName");
  expect(quarantined.descriptionZh).toBe(PENDING_DESCRIPTION_ZH);
  expect(reviewedDescription(root)).toBeNull();
});
it("does not fall back to the old desktop path when the migrated Workbench path is missing", async () => {
  vi.mocked(fetchRepoRoot).mockResolvedValue([]);
  await expect(detectPlugin("See-Sol-Lab/DeepSeekGUI", [], "pinned", { reviewedTarget: reviewedPluginTargets["see-sol-lab/deepseekgui"] })).rejects.toThrow("metadata missing");
  expect(fetchFileViaApi).not.toHaveBeenCalled();
});
