import { afterEach, describe, expect, it, vi } from "vitest";
import { clearInstallVerificationCache } from "../src/install/install-verify.js";
import {
  clearInstallApprovals,
  consumeInstallApproval,
  createInstallPreflight,
} from "../src/host/install-preflight.js";
import type { RankingEntry } from "../src/shared/types.js";

function entry(extra: Partial<RankingEntry> = {}): RankingEntry {
  return {
    rank: 1,
    fullName: "acme/demo",
    name: "demo",
    owner: "acme",
    description: "Demo",
    descriptionZh: "演示",
    stars: 1,
    dailyStars: 0,
    weeklyStars: 0,
    hotScore: 0,
    forks: 0,
    openIssues: 0,
    language: null,
    homepage: null,
    license: null,
    topics: [],
    tags: [],
    type: "cordis-plugin",
    install: { commands: ["dsh plugin add demo@latest"] },
    sources: [],
    url: "https://github.com/acme/demo",
    pushedAt: "",
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

afterEach(() => {
  clearInstallApprovals();
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
});

describe("install preflight approval", () => {
  it("binds user approval to an exact npm version and its lifecycle scripts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.4.2",
      repository: "https://github.com/acme/demo.git",
      dist: { integrity: "sha512-example" },
      scripts: { postinstall: "node setup.js" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    const approval = await createInstallPreflight(entry(), "web");
    expect(approval.preflight).toMatchObject({
      fullName: "acme/demo",
      requiresExplicitApproval: true,
      activationExpectation: "restart-required",
      provenance: {
        requestedTarget: "demo@latest",
        resolvedTarget: "demo@1.4.2",
        integrity: "sha512-example",
        repositoryIdentity: "matched",
      },
      lifecycleScripts: [{ name: "postinstall", command: "node setup.js" }],
    });
    expect(() => consumeInstallApproval(
      approval.preflight.approvalToken,
      "acme/demo",
      "web",
    )).toThrow("需要明确确认");
    expect(consumeInstallApproval(
      approval.preflight.approvalToken,
      "acme/demo",
      "web",
      true,
    ).bundleTarget?.target).toBe("demo@1.4.2");
    expect(() => consumeInstallApproval(approval.preflight.approvalToken, "acme/demo", "web"))
      .toThrow("安装确认已过期");
  });

  it("pins a Skill to the verified default-branch commit", async () => {
    const sha = "d".repeat(40);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha }), { status: 200 })));
    const approval = await createInstallPreflight(entry({ type: "skill", install: undefined }), "web");
    expect(approval.preflight).toMatchObject({
      kind: "skill",
      activationExpectation: "not-applicable",
      provenance: { resolvedTarget: `github:acme/demo#${sha}`, commit: sha },
    });
  });

  it("keeps configuration-required distinct from restart-only completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.4.2",
      repository: "https://github.com/acme/demo.git",
      dist: { integrity: "sha512-example" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    const approval = await createInstallPreflight(entry({
      install: { needsConfig: true, commands: ["dsh plugin add demo@latest"] },
    }), "web");
    expect(approval.preflight.activationExpectation).toBe("configuration-required");
  });
});
