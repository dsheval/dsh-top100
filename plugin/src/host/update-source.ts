/** Preserve the user's selected release channel after preflight pins an immutable target. */
import { parse, valid } from "semver";
import { npmPackageSpec } from "../install/install-spec.js";
import { parseNpmSelector } from "../install/npm-selector.js";
import { githubInstallTarget, parseGitHubSource } from "../shared/github-source.js";
import type { InstallProvenance, UpdateStrategy } from "../shared/types.js";

export class UpdateStrategyRequiredError extends Error {
  readonly code = "update-strategy-required";

  constructor(message: string) {
    super(message);
    this.name = "UpdateStrategyRequiredError";
  }
}

export interface UpdateSource {
  target: string;
  policy: string;
}

const COMMIT_RE = /^[0-9a-f]{7,40}$/i;

function sameExactVersion(left: string | null, right: string | null): boolean {
  // Preserve build metadata too: provenance from a different installed artifact
  // must not restore its former moving selector.
  return Boolean(left && right && valid(left) && valid(right)
    && left.replace(/^v/, "") === right.replace(/^v/, ""));
}

function originalSelector(name: string, installedSpec: string, version: string | null, provenance?: InstallProvenance | null): string | null {
  if (!provenance || typeof provenance.packageName !== "string" || provenance.packageName.toLowerCase() !== name.toLowerCase()
    || typeof provenance.requestedTarget !== "string" || typeof provenance.resolvedTarget !== "string"
    || (provenance.version !== null && typeof provenance.version !== "string")
    || (provenance.commit !== null && typeof provenance.commit !== "string")
    || typeof provenance.integrity !== "string" || !provenance.integrity.trim()
    || !Number.isFinite(provenance.verifiedAt)) return null;
  const installedGithub = parseGitHubSource(installedSpec);
  if (installedGithub) {
    if (provenance.source !== "github") return null;
    const resolved = parseGitHubSource(provenance.resolvedTarget);
    const requested = parseGitHubSource(provenance.requestedTarget);
    if (!resolved || !requested || !resolved.ref || !installedGithub.ref
      || !/^[0-9a-f]{40}$/i.test(resolved.ref)
      || resolved.ref.toLowerCase() !== installedGithub.ref.toLowerCase()
      || provenance.commit?.toLowerCase() !== resolved.ref.toLowerCase()
      || resolved.repository !== installedGithub.repository || requested.repository !== resolved.repository
      || resolved.path !== installedGithub.path || (requested.path !== null && requested.path !== resolved.path)
      || (provenance.version !== null && version !== provenance.version)) return null;
    // Older verified records may lack the inferred monorepo path in their
    // requested target. Keep the path proven by the actual installed target.
    return githubInstallTarget({ ...requested, path: resolved.path });
  }
  if (provenance.source !== "npm") return null;
  const resolved = npmPackageSpec(provenance.resolvedTarget);
  const requested = npmPackageSpec(provenance.requestedTarget);
  if (!resolved || !requested || resolved.name.toLowerCase() !== name.toLowerCase()
    || requested.name.toLowerCase() !== name.toLowerCase()
    || !sameExactVersion(installedSpec, resolved.selector)
    || !sameExactVersion(version, provenance.version)
    || !sameExactVersion(version, resolved.selector)) return null;
  return requested.selector ?? "latest";
}

export function resolveUpdateSource(
  name: string,
  installedSpec: string,
  options: { version?: string | null; provenance?: InstallProvenance | null; strategy?: UpdateStrategy } = {},
): UpdateSource | null {
  const strategy = options.strategy ?? "preserve";
  if (strategy !== "preserve" && strategy !== "latest") throw new Error("更新策略无效");
  if (npmPackageSpec(name)?.name !== name) return null;
  const github = parseGitHubSource(installedSpec);
  if (github) {
    if (strategy === "latest") return {
      target: githubInstallTarget({ ...github, ref: null }), policy: "切换到仓库默认分支，保留插件子目录",
    };
    const original = originalSelector(name, installedSpec, options.version ?? null, options.provenance);
    const source = original ? parseGitHubSource(original)! : github;
    if (source.ref && COMMIT_RE.test(source.ref)) {
      throw new UpdateStrategyRequiredError("当前插件固定在 GitHub 提交，无法确认原更新分支；请选择“切换到最新”以使用仓库默认分支");
    }
    return {
      target: githubInstallTarget(source),
      policy: source.ref ? `保留 GitHub 分支或标签 ${source.ref}${source.path ? ` · ${source.path}` : ""}`
        : `跟随仓库默认分支${source.path ? ` · ${source.path}` : ""}`,
    };
  }
  const installed = parseNpmSelector(installedSpec);
  if (!installed) return null;
  if (strategy === "latest") return { target: `${name}@latest`, policy: "切换到 npm latest 频道" };
  const original = originalSelector(name, installedSpec, options.version ?? null, options.provenance);
  const selector = parseNpmSelector(original ?? installed.value)!;
  if (selector.kind === "version") {
    const version = parse(selector.value)!;
    const range = `${version.major === 0 ? "~" : "^"}${selector.value}`;
    return { target: `${name}@${range}`, policy: `原安装固定版本，默认仅更新兼容范围 ${range}` };
  }
  return {
    target: `${name}@${selector.value}`,
    policy: selector.kind === "tag" ? `保留 npm ${selector.value} 频道` : `保留 npm 版本范围 ${selector.value}`,
  };
}
