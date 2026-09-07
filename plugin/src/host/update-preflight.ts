/** Bind updates to installed identity and immutable, separately approved source evidence. */
import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseInstallSpec, npmPackageSpec } from "../install/install-spec.js";
import { verifyInstallSpec, type VerifiedInstallTarget } from "../install/install-verify.js";
import type { InstallPreflight } from "../shared/types.js";
import { bundleInstallPreflight } from "./install-preflight.js";
import { resolveUpdateTarget } from "./manage.js";
import { isProtectedPackage } from "./patch-toggle.js";
import { profileDir, readInstalled, readInstalledManifest } from "./profile.js";

import { parseGitHubSource, githubRepositoryIdentity } from "../shared/github-source.js";

const APPROVAL_TTL_MS = 10 * 60 * 1000;
export interface ApprovedUpdate {
  name: string;
  currentSpec: string;
  currentVersion: string | null;
  preflight: InstallPreflight;
  bundleTarget: VerifiedInstallTarget;
}
interface InstalledIdentity {
  profile: string;
  directory: string;
  spec: string;
  version: string | null;
  packageName: string;
  manifestFingerprint: string;
  repositoryUrl: string | null;
  repositoryPath: string | null;
}
const approvals = new Map<string, ApprovedUpdate>();
const identities = new WeakMap<ApprovedUpdate, InstalledIdentity>();

function installedIdentity(name: string, profile: string, explicitDir?: string): InstalledIdentity {
  if (npmPackageSpec(name)?.name !== name) throw new Error("插件包名无效");
  if (isProtectedPackage(name)) throw new Error("受保护的插件不能在此更新");
  const spec = readInstalled(profile, explicitDir)[name];
  if (typeof spec !== "string") throw new Error("插件未安装或已从 Profile 移除");
  if (/^(?:link|file):/.test(spec)) throw new Error("本地插件请在源码目录更新");
  // Never turn an unrecognized URL, npm alias or workspace source into a same-name registry package.
  if (!resolveUpdateTarget(name, spec)) {
    throw new Error("当前插件安装源不支持自动更新，请使用原安装方式");
  }
  const manifest = readInstalledManifest(profile, name, explicitDir);
  if (!manifest || typeof manifest.name !== "string" || manifest.name.toLowerCase() !== name.toLowerCase()) {
    throw new Error("已安装插件的包名无法核对，请先修复本地安装");
  }
  const repository = manifest.repository;
  const repoObject = repository !== null && typeof repository === "object"
    ? repository as { url?: unknown; directory?: unknown } : undefined;
  const url = typeof repository === "string" ? repository : repoObject?.url;
  const path = repoObject?.directory;
  const directory = resolve(profileDir(profile, explicitDir));
  return {
    profile,
    directory: realpathSync(directory),
    spec,
    version: typeof manifest.version === "string" ? manifest.version : null,
    packageName: manifest.name,
    manifestFingerprint: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    repositoryUrl: typeof url === "string" ? url.trim() : null,
    repositoryPath: typeof path === "string" ? path.trim().replace(/^\.\//, "").replace(/^\/+|\/+$/g, "") || null : null,
  };
}

export function assertUpdateUnchanged(approval: ApprovedUpdate, profile: string, profileDirectory?: string): void {
  const original = identities.get(approval);
  const current = installedIdentity(approval.name, profile, profileDirectory);
  if (!original || JSON.stringify(current) !== JSON.stringify(original)) {
    throw new Error("插件版本、安装来源或 Profile 已变化，请重新检查更新");
  }
}

function removeExpiredApprovals(): void {
  for (const [token, approval] of approvals) {
    if (approval.preflight.expiresAt <= Date.now()) approvals.delete(token);
  }
}

export async function createUpdatePreflight(
  name: string,
  profile: string,
  profileDirectory?: string,
  signal?: AbortSignal,
): Promise<ApprovedUpdate> {
  signal?.throwIfAborted();
  removeExpiredApprovals();
  const identity = installedIdentity(name, profile, profileDirectory);
  const target = resolveUpdateTarget(name, identity.spec);
  const spec = target ? parseInstallSpec(target) : null;
  if (!spec) throw new Error("当前插件安装源不支持自动更新");
  const source = spec.kind === "github" ? parseGitHubSource(spec.spec) : null;
  const sourceRepository = source?.repository;
  const manifestRepository = githubRepositoryIdentity(identity.repositoryUrl) ?? undefined;
  if (sourceRepository && manifestRepository && sourceRepository !== manifestRepository) {
    throw new Error("已安装插件声明的仓库与安装来源不一致，请先核对本地安装");
  }
  const sourcePath = source?.path ?? undefined;
  if (sourcePath && identity.repositoryPath && sourcePath !== identity.repositoryPath) {
    throw new Error("已安装插件声明的仓库子目录与安装来源不一致");
  }
  const expectedRepository = sourceRepository ?? manifestRepository;
  const expiresAt = Date.now() + APPROVAL_TTL_MS;
  const verifiedTarget = await verifyInstallSpec(spec, {
    signal,
    expectedPackageName: identity.packageName,
    expectedRepository,
    expectedRepositoryPath: sourcePath ?? identity.repositoryPath ?? undefined,
  });
  const bundleTarget = spec.kind === "npm" && !expectedRepository
    ? { ...verifiedTarget, repositoryIdentity: "unavailable" as const }
    : verifiedTarget;
  signal?.throwIfAborted();
  if (Date.now() >= expiresAt) throw new Error("更新预检已过期，请重新检查");
  const preflight = bundleInstallPreflight(bundleTarget, {
    fullName: expectedRepository ?? githubRepositoryIdentity(bundleTarget.repositoryUrl) ?? name,
    profile,
    approvalToken: randomUUID(),
    expiresAt,
  });
  const approval: ApprovedUpdate = { name, currentSpec: identity.spec, currentVersion: identity.version, preflight, bundleTarget };
  identities.set(approval, identity);
  assertUpdateUnchanged(approval, profile, profileDirectory);
  signal?.throwIfAborted();
  approvals.set(preflight.approvalToken, approval);
  return approval;
}

/** Validate the entire batch before consuming any token. */
export function validateUpdateApprovals(
  requests: Array<{ name: string; approvalToken: string; risksAccepted: boolean }>,
  profile: string,
  profileDirectory?: string,
): ApprovedUpdate[] {
  removeExpiredApprovals();
  if (requests.length === 0) throw new Error("请选择需要更新的插件");
  const names = new Set<string>();
  const tokens = new Set<string>();
  const result = requests.map((request) => {
    if (names.has(request.name.toLowerCase()) || tokens.has(request.approvalToken)) {
      throw new Error("更新列表包含重复的插件或确认令牌");
    }
    names.add(request.name.toLowerCase());
    tokens.add(request.approvalToken);
    const approval = approvals.get(request.approvalToken);
    if (!approval) throw new Error("更新确认已过期，请重新检查精确来源与风险");
    if (approval.name !== request.name || approval.preflight.profile !== profile) {
      throw new Error("更新确认与当前插件或 Profile 不匹配");
    }
    if (approval.preflight.requiresExplicitApproval && request.risksAccepted !== true) {
      throw new Error("该更新包含警告项，需要明确确认来源、脚本与风险");
    }
    assertUpdateUnchanged(approval, profile, profileDirectory);
    return approval;
  });
  for (const approval of result) approvals.delete(approval.preflight.approvalToken);
  return result;
}

export function clearUpdateApprovals(): void {
  approvals.clear();
}

export function discardUpdateApprovals(tokens: readonly string[]): void {
  for (const token of tokens) approvals.delete(token);
}
