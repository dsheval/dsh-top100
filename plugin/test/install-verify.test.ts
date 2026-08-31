import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InstallVerificationError,
  clearInstallVerificationCache,
  verifyInstallSpec,
} from "../src/install/install-verify.js";

afterEach(() => {
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
});

describe("install source verification", () => {
  it("looks up an exact npm tag and recognizes lifecycle scripts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "@acme/demo",
      version: "2.0.0-next.3",
      repository: { url: "git+https://github.com/acme/demo.git" },
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      scripts: { postinstall: "node install.js" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec(
      { kind: "npm", spec: "@acme/demo@next" },
      { expectedRepository: "acme/demo" },
    )).resolves.toMatchObject({
      requestedTarget: "@acme/demo@next",
      target: "@acme/demo@2.0.0-next.3",
      source: "npm",
      packageName: "@acme/demo",
      version: "2.0.0-next.3",
      integrity: "sha512-demo",
      repositoryIdentity: "matched",
      lifecycleScripts: [{ name: "postinstall", command: "node install.js" }],
      needsBuildApproval: true,
      buildApprovalKeys: ["@acme/demo"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@acme%2Fdemo/next",
      expect.any(Object),
    );
  });

  it("fails closed when an npm package is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 404,
      statusText: "Not Found",
    })));
    await expect(verifyInstallSpec({ kind: "npm", spec: "missing-plugin" }))
      .rejects.toMatchObject<Partial<InstallVerificationError>>({ fatal: true });
  });

  it("allows dev-only workspace tooling in a published npm package", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      devDependencies: { "@acme/build-tools": "workspace:*" },
    }), { status: 200 })));
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo" })).resolves.toMatchObject({
      packageName: "demo",
      needsBuildApproval: false,
      buildApprovalKeys: [],
    });
  });

  it("reports exhausted GitHub verification quota", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", {
      status: 403,
      statusText: "Forbidden",
      headers: { "x-ratelimit-remaining": "0" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/demo" }))
      .rejects.toThrow("GitHub 安装源验证额度已用尽");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies an explicit GitHub monorepo path selector", async () => {
    const manifest = Buffer.from(JSON.stringify({
      name: "demo",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    })).toString("base64");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "b".repeat(40) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: manifest }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/repo#path:/packages/demo" }))
      .resolves.toMatchObject({
        target: `github:acme/repo#${"b".repeat(40)}&path:/packages/demo`,
        packageName: "demo",
        commit: "b".repeat(40),
      });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.github.com/repos/acme/repo/contents/packages/demo/package.json?ref=${"b".repeat(40)}`,
      expect.any(Object),
    );
  });

  it("writes both stable and commit-pinned GitHub build approval keys", async () => {
    const sha = "a".repeat(40);
    const manifest = Buffer.from(JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      scripts: { prepare: "npm run build" },
    })).toString("base64");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: manifest }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/repo" }))
      .resolves.toMatchObject({
        target: `github:acme/repo#${sha}`,
        buildApprovalKeys: [
          "demo@git+https://github.com/acme/repo.git",
          `demo@https://codeload.github.com/acme/repo/tar.gz/${sha}`,
        ],
      });
  });

  it("rejects an npm package whose declared GitHub repository conflicts with the catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      repository: "https://github.com/other/repository.git",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    await expect(verifyInstallSpec(
      { kind: "npm", spec: "demo" },
      { expectedRepository: "acme/demo" },
    )).rejects.toThrow("与目录条目 acme/demo 不一致");
  });

  it("rejects registry metadata for a different npm package name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "other-package",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 })));
    await expect(verifyInstallSpec({ kind: "npm", spec: "demo" }))
      .rejects.toThrow("与请求目标 demo 不一致");
  });

  it("rejects a GitHub install target that points at a different catalog repository", async () => {
    await expect(verifyInstallSpec(
      { kind: "github", spec: "github:other/repository" },
      { expectedRepository: "acme/demo" },
    )).rejects.toThrow("与目录条目 acme/demo 不一致");
  });

  it("keeps a monorepo path when pinning a GitHub build target", async () => {
    const sha = "c".repeat(40);
    const manifest = Buffer.from(JSON.stringify({
      name: "demo",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      scripts: { prepare: "npm run build" },
    })).toString("base64");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ content: manifest }), { status: 200 })));
    await expect(verifyInstallSpec({ kind: "github", spec: "github:acme/repo#path:/packages/demo" }))
      .resolves.toMatchObject({ target: `github:acme/repo#${sha}&path:/packages/demo` });
  });

  it("caches a successful verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dist: { integrity: "sha512-demo" },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const spec = { kind: "npm", spec: "demo" } as const;
    await verifyInstallSpec(spec);
    await verifyInstallSpec(spec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
