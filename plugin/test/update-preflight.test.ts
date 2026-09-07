import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearInstallVerificationCache } from "../src/install/install-verify.js";
import { assertUpdateUnchanged, clearUpdateApprovals, createUpdatePreflight, discardUpdateApprovals, validateUpdateApprovals, type ApprovedUpdate } from "../src/host/update-preflight.js";

let directory: string;
function install(name = "demo", spec = "^1.0.0", extra: Record<string, unknown> = {}) {
  const profilePath = join(directory, "package.json");
  let dependencies = {};
  try { dependencies = JSON.parse(readFileSync(profilePath, "utf8")).dependencies; } catch { /* first package */ }
  writeFileSync(profilePath, JSON.stringify({ dependencies: { ...dependencies, [name]: spec } }));
  const packageDir = join(directory, "node_modules", name);
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, "package.json"), JSON.stringify({
    name, version: "1.0.0", repository: "https://github.com/acme/demo.git", ...extra,
  }));
}
function registry(extra: Record<string, unknown> = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    name: "demo", version: "1.2.3", repository: "https://github.com/acme/demo.git",
    dist: { integrity: "sha512-example" }, dsh: { bundle: { patch: "./patch.yml" } }, ...extra,
  }), { status: 200 })));
}
function request(approval: ApprovedUpdate, risksAccepted = true) {
  return { name: approval.name, approvalToken: approval.preflight.approvalToken, risksAccepted };
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "top100-update-preflight-")); });
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  clearUpdateApprovals();
  clearInstallVerificationCache();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("update source approval", () => {
  it("pins npm updates and requires explicit approval for new lifecycle scripts", async () => {
    install(); registry({ scripts: { postinstall: "node setup.js" } });
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(approval).toMatchObject({ name: "demo", currentSpec: "^1.0.0", currentVersion: "1.0.0",
      preflight: { fullName: "acme/demo", requiresExplicitApproval: true,
        provenance: { resolvedTarget: "demo@1.2.3", repositoryIdentity: "matched" } },
    });
    expect(() => validateUpdateApprovals([request(approval, false)], "web", directory)).toThrow("需要明确确认");
    expect(validateUpdateApprovals([request(approval)], "web", directory)[0].bundleTarget.target).toBe("demo@1.2.3");
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已过期");
  });

  it("keeps GitHub monorepo updates on the installed package path and pins the commit", async () => {
    const sha = "a".repeat(40);
    install("demo", `github:acme/mono#${"b".repeat(40)}&path:/plugins/demo`, {
      repository: { url: "git+https://github.com/acme/mono.git", directory: "plugins/demo" },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/acme/mono")) return new Response(JSON.stringify({ default_branch: "main" }));
      if (url.includes("/commits/main")) return new Response(JSON.stringify({ sha }));
      expect(url).toContain(`/contents/plugins/demo/package.json?ref=${sha}`);
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({
        name: "demo", version: "2.0.0", dsh: { bundle: { patch: "./patch.yml" } },
      })).toString("base64") }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(approval.bundleTarget.target).toBe(`github:acme/mono#${sha}&path:/plugins/demo`);
    expect(approval.preflight.fullName).toBe("acme/mono");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    { name: "another", message: "包名" },
    { repository: "https://github.com/other/demo.git", message: "仓库" },
  ])("rejects changed source identity: %j", async ({ message, ...extra }) => {
    install(); registry(extra);
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow(message);
  });

  it("rejects inconsistent installed GitHub identity before network requests", async () => {
    install("demo", "github:acme/other"); registry();
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow("仓库与安装来源不一致");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["link:../demo", "file:/tmp/demo", "npm:another@1", "https://other.test/plugin.tgz", "workspace:*"])("does not redirect unsupported source %s to npm", async (spec) => {
    install("demo", spec); registry();
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects protected packages", async () => {
    install("@deepseek-ai/dsh-web-app"); registry();
    await expect(createUpdatePreflight("@deepseek-ai/dsh-web-app", "web", directory)).rejects.toThrow("受保护");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { spec: "^1.1.0", manifest: {} },
    { spec: "^1.0.0", manifest: { version: "1.1.0" } },
    { spec: "^1.0.0", manifest: { scripts: { install: "node changed.js" } } },
    { spec: "^1.0.0", manifest: { repository: "https://github.com/other/demo" } },
  ])("rejects local changes after preflight: %j", async ({ spec, manifest }) => {
    install(); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    install("demo", spec, manifest);
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已变化");
    expect(() => assertUpdateUnchanged(approval, "web", directory)).toThrow("已变化");
  });

  it("rejects installation changes made during network preflight", async () => {
    install();
    vi.stubGlobal("fetch", vi.fn(async () => {
      install("demo", "^1.1.0");
      return new Response(JSON.stringify({ name: "demo", version: "1.2.0", repository: "https://github.com/acme/demo",
        dist: { integrity: "sha512-example" }, dsh: { bundle: { patch: "./patch.yml" } } }));
    }));
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow("已变化");
  });

  it("validates every batch token before consuming and rejects duplicates", async () => {
    install(); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(() => validateUpdateApprovals([request(approval), request(approval)], "web", directory)).toThrow("重复");
    expect(() => validateUpdateApprovals([request(approval), { name: "other", approvalToken: "invalid", risksAccepted: true }], "web", directory)).toThrow("已过期");
    expect(validateUpdateApprovals([request(approval)], "web", directory)).toHaveLength(1);
  });

  it("binds tokens to package, profile name and resolved directory", async () => {
    install(); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(() => validateUpdateApprovals([{ ...request(approval), name: "other" }], "web", directory)).toThrow("不匹配");
    expect(() => validateUpdateApprovals([request(approval)], "another", directory)).toThrow("不匹配");
    const otherDirectory = mkdtempSync(join(directory, "another-profile-"));
    mkdirSync(join(otherDirectory, "node_modules", "demo"), { recursive: true });
    writeFileSync(join(otherDirectory, "package.json"), readFileSync(join(directory, "package.json")));
    writeFileSync(join(otherDirectory, "node_modules", "demo", "package.json"), readFileSync(join(directory, "node_modules", "demo", "package.json")));
    expect(() => validateUpdateApprovals([request(approval)], "web", otherDirectory)).toThrow("已变化");
    expect(validateUpdateApprovals([request(approval)], "web", directory)).toHaveLength(1);
  });

  it("rejects expired and discarded approvals", async () => {
    install(); registry();
    vi.useFakeTimers();
    const approval = await createUpdatePreflight("demo", "web", directory);
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(() => validateUpdateApprovals([request(approval)], "web", directory)).toThrow("已过期");
    const next = await createUpdatePreflight("demo", "web", directory);
    discardUpdateApprovals([next.preflight.approvalToken]);
    expect(() => validateUpdateApprovals([request(next)], "web", directory)).toThrow("已过期");
  });

  it("does not return an approval after cancellation during source verification", async () => {
    install();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(async () => {
      controller.abort();
      return new Response(JSON.stringify({ name: "demo", version: "2.0.0", dsh: { bundle: { patch: "./patch.yml" } } }));
    }));
    await expect(createUpdatePreflight("demo", "web", directory, controller.signal)).rejects.toThrow();
  });
});

describe("shared repository parsing across install and update", () => {
  it.each([
    "https://github.com/acme/demo/tree/main/packages/demo",
    "git+ssh://git@github.com:22/acme/demo.git",
    "acme/demo",
  ])("does not lose installed repository identity for %s", async (repository) => {
    install("demo", "1.0.0", { repository });
    registry({ repository: "https://github.com/other/different" });
    await expect(createUpdatePreflight("demo", "web", directory)).rejects.toThrow("不一致");
  });

  it.each([undefined, "https://other.test/acme/demo"])("requires source risk approval when the installed repository is unknown: %s", async (repository) => {
    install("demo", "1.0.0", { repository }); registry();
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(approval.preflight).toMatchObject({ requiresExplicitApproval: true, provenance: { repositoryIdentity: "unavailable" } });
    expect(() => validateUpdateApprovals([request(approval, false)], "web", directory)).toThrow("需要明确确认");
  });

  it.each([
    "git+https://github.com/acme/mono.git", "git+ssh://git@github.com/acme/mono.git", "git@github.com:acme/mono.git",
  ])("updates the package path from pnpm's persisted Git spec %s", async (base) => {
    const sha = "d".repeat(40);
    install("demo", `${base}#${"a".repeat(40)}&path:/packages/demo`, { repository: { url: "https://github.com/acme/mono/tree/main/packages/demo", directory: "packages/demo" } });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/acme/mono")) return new Response(JSON.stringify({ default_branch: "main" }));
      if (url.includes("/commits/main")) return new Response(JSON.stringify({ sha }));
      expect(url).toBe(`https://api.github.com/repos/acme/mono/contents/packages/demo/package.json?ref=${sha}`);
      return new Response(JSON.stringify({ content: Buffer.from(JSON.stringify({ name: "demo", version: "2.0.0", dsh: { bundle: { patch: "./patch.yml" } } })).toString("base64") }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const approval = await createUpdatePreflight("demo", "web", directory);
    expect(approval.bundleTarget.target).toBe(`github:acme/mono#${sha}&path:/packages/demo`);
    expect(approval.bundleTarget.repositoryIdentity).toBe("matched");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
