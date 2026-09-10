import type { DshPlugin } from "@dsh-top100/schema";
import { DISCOVERY_POLICY_VERSION } from "./detect.js";
import { SOURCE_DOCUMENT_CACHE_VERSION } from "./selected-readme.js";

/** 暂时读取失败可以保留历史；本轮已确定不符合收录标准的仓库不得被恢复流程补回。 */
export function canRestorePrevious(id: string, definitiveRejections: ReadonlySet<string>): boolean {
  return !definitiveRejections.has(id.toLowerCase());
}

/** 刷新星数/推送时间不是重新验证插件；历史结构证据仅标为待复核。 */
export function restoredDiscovery(previous: DshPlugin): NonNullable<DshPlugin["install"]["discovery"]> {
  return {
    status: "review-required",
    kind: previous.install.discovery?.kind ?? (previous.type === "skill" ? "skill" : "host"),
    evidence: [...new Set([...(previous.install.discovery?.evidence ?? []), "历史记录保留，本轮未完成结构复核"])],
    checkedAt: previous.install.discovery?.checkedAt ?? previous.lastCheckedAt,
    policyVersion: previous.install.discovery?.policyVersion ?? 0,
    sourceRevision: previous.install.discovery?.sourceRevision ?? previous.pushedAt,
  };
}

export function canReuseDetectionCache(
  cache: { schemaVersion: number; pushedAt: string; installParserVersion?: number; sourceDocumentVersion?: number; checkedAt?: string } | null,
  pushedAt: string,
  installParserVersion: number
): boolean {
  return cache?.schemaVersion === DISCOVERY_POLICY_VERSION
    && cache.sourceDocumentVersion === SOURCE_DOCUMENT_CACHE_VERSION
    && cache.installParserVersion === installParserVersion
    && cache.pushedAt === pushedAt && Boolean(cache.checkedAt);
}
