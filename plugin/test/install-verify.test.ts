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
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
      scripts: { postinstall: "node install.js" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyInstallSpec({ kind: "npm", spec: "@acme/demo@next" })).resolves.toEqual({
      target: "@acme/demo@next",
      source: "npm",
      packageName: "@acme/demo",
      needsBuildApproval: true,
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

  it("caches a successful verification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "demo",
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const spec = { kind: "npm", spec: "demo" } as const;
    await verifyInstallSpec(spec);
    await verifyInstallSpec(spec);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
