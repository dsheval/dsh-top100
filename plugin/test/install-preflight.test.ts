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
    install: { packageName: "demo", commands: ["dsh plugin add demo@latest"] },
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
  it("preflights the sidebar repository without resolving its prerequisite marketplace", async () => {
    const fullName = "e2mcc/dsh-popout-sidebar";
    const sha = "c".repeat(40);
    const fetchMock = vi.fn(async (url: string) => {
      const root = `https://api.github.com/repos/${fullName}`;
      if (!url.startsWith(root)) throw new Error(`Unexpected source: ${url}`);
      const payload = url === root ? { default_branch: "main" }
        : url.includes("/commits/") ? { sha }
          : { content: Buffer.from(JSON.stringify({
            name: "dsh-popout-sidebar",
            version: "1.0.0",
            dsh: { bundle: { patch: "./cordis.patch.yml" } },
          })).toString("base64") };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const approval = await createInstallPreflight(entry({
      fullName,
      install: { commands: [
        "dsh plugin --profile web add dshmarket",
        `dsh plugin --profile web add github:${fullName}`,
      ] },
    }), "web");
    expect(approval.preflight.provenance).toMatchObject({
      requestedTarget: `github:${fullName}`,
      resolvedTarget: `github:${fullName}#${sha}`,
      repositoryIdentity: "matched",
    });
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([url]) => url.startsWith(`https://api.github.com/repos/${fullName}`))).toBe(true);
  });

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
      install: { needsConfig: true, packageName: "demo", commands: ["dsh plugin add demo@latest"] },
    }), "web");
    expect(approval.preflight.activationExpectation).toBe("configuration-required");
  });
});
