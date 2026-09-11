import { describe, expect, it } from "vitest";
import { refreshCachedInstallEvidence } from "../src/install-cache.js";
import { resolveCatalogInstallTarget } from "../../plugin/src/shared/install-source.js";

const identity = {
  fullName: "ayuayue/PiDeck",
  packageName: "dsh-tool-pwsh-persistent",
  repositoryPath: "packages/dsh-tool-pwsh-persistent",
};
const stale = {
  commands: ["dsh plugin add dsh-tool-pwsh-persistent", "npm install", "dsh plugin"],
  source: "README",
};
const command = "npx @deepseek-ai/dsh plugin --profile web add ./dsh-tool-pwsh-persistent-0.1.2.tgz";
const readme = [
  "# dsh-tool-pwsh-persistent",
  "**Do not `npm install` the tarball into the PiDeck repo**, and **do not** `dsh plugin add dsh-tool-pwsh-persistent` (that hits the npm registry → 404).",
  "## Testers (dsh-web / official CLI)",
  "```powershell", command, "```",
  "`dsh plugin` is a pnpm forwarder into `~/.dsh/profiles/web`.",
].join("\n");

describe("cached installation evidence repair", () => {
  it("repairs same-version stale evidence from an already downloaded exact-source README", () => {
    const result = refreshCachedInstallEvidence(identity, stale, readme);
    expect(result).toEqual({ installParsed: { commands: [command], source: "README" }, needsReadmeRefresh: false });
    expect(stale.commands).toContain("dsh plugin add dsh-tool-pwsh-persistent");
    expect(resolveCatalogInstallTarget({ fullName: identity.fullName, install: {
      packageName: identity.packageName, commands: result.installParsed.commands,
    } })).toBeNull();
  });

  it("withholds known bad commands when the source cache is unavailable", () => {
    const result = refreshCachedInstallEvidence(identity, stale, null);
    expect(result).toEqual({ installParsed: { commands: [], source: "template" }, needsReadmeRefresh: true });
    expect(resolveCatalogInstallTarget({ fullName: identity.fullName, install: {
      packageName: identity.packageName, commands: result.installParsed.commands,
    } })).toBeNull();
  });

  it("remains safe through failed refreshes and resumes when the targeted document is available", () => {
    const missing = refreshCachedInstallEvidence(identity, stale, null);
    expect(refreshCachedInstallEvidence(identity, missing.installParsed, null)).toEqual(missing);
    const repaired = refreshCachedInstallEvidence(identity, missing.installParsed, readme);
    expect(refreshCachedInstallEvidence(identity, repaired.installParsed, readme)).toEqual(repaired);
  });

  it("preserves a persisted repaired tarball command when the source cache later expires", () => {
    const repaired = refreshCachedInstallEvidence(identity, stale, readme);
    const persisted = JSON.parse(JSON.stringify(repaired.installParsed));
    const nextDay = refreshCachedInstallEvidence(identity, persisted, null);
    expect(nextDay).toEqual(repaired);
    expect(resolveCatalogInstallTarget({ fullName: identity.fullName, install: {
      packageName: identity.packageName, commands: nextDay.installParsed.commands,
    } })).toBeNull();
  });

  it.each([
    { commands: [command, "dsh plugin add dsh-tool-pwsh-persistent"] },
    { commands: ["dsh plugin add --unsafe ./demo.tgz"] },
    { commands: ["dsh plugin add ./demo.tgz && echo ./another.tgz"] },
  ])("does not mistake invalid or mixed cache commands for repaired evidence: $commands", ({ commands }) => {
    expect(refreshCachedInstallEvidence(identity, { commands, source: "README" }, null))
      .toEqual({ installParsed: { commands: [], source: "template" }, needsReadmeRefresh: true });
  });

  it("does not trigger other repositories or sibling packages to refresh", () => {
    for (const other of [
      { ...identity, fullName: "acme/PiDeck" },
      { ...identity, packageName: "other", repositoryPath: "packages/other" },
    ]) expect(refreshCachedInstallEvidence(other, stale, null))
      .toEqual({ installParsed: stale, needsReadmeRefresh: false });
  });

  it("treats an empty source document as authoritative instead of restoring prior commands", () => {
    expect(refreshCachedInstallEvidence(identity, stale, ""))
      .toEqual({ installParsed: { commands: [], source: "template" }, needsReadmeRefresh: false });
  });
});
