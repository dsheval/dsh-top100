import { functionEvidenceMarker, needsFunctionReview } from "./reviewed-evidence-state.js";
import { reviewedFunctionEvidence } from "./reviewed-evidence.js";
/** Source identity and eligibility shared by daily collection and frozen batches. */
import { createHash } from "node:crypto";
import type { InstallInfo } from "@dsh-top100/schema";
import { CATEGORY_POLICY_VERSION } from "./categories.js";
import editorialHolds from "../config/editorial-holds.json";
import { cleanDescription, isPlaceholder, matchesReviewedIdentity, matchesReviewedReadme, type ReviewedDescription } from "../../plugin/src/shared/description-rules.js";
import reviewedDescriptions from "../../plugin/src/shared/reviewed-descriptions.json";
import { reviewedPluginTargets } from "./reviewed-targets.js";

export const DESCRIPTION_POLICY_VERSION = 3;
export interface ContentSource {
  id?: string;
  fullName?: string;
  name?: string;
  type?: string;
  description?: string | null;
  readmeSummary?: string | null;
  topics?: string[];
  install?: Partial<InstallInfo> | null;
}

export interface EditorialHold {
  sourceDescription: string;
  sourceReadme: string;
  sourceInstall: ContentSource["install"];
  reason: string;
}
function installEvidence(install: ContentSource["install"]): string {
  return JSON.stringify([install?.method ?? null, install?.target ?? null, install?.packageName ?? null,
    install?.repositoryPath ?? null, install?.commands ?? [], install?.commandSource ?? null]);
}
export function matchingEditorialHold(entry: ContentSource): EditorialHold | null {
  if (needsFunctionReview(entry)) return { sourceDescription: entry.description ?? "", sourceReadme: entry.readmeSummary ?? "", sourceInstall: entry.install,
    reason: "已复核的功能源码尚未通过当前核验，旧简介和分类暂停使用。" };
  const hold = (editorialHolds as Record<string, EditorialHold>)[(entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase()];
  if (hold && hold.sourceDescription === (entry.description ?? "") && hold.sourceReadme === (entry.readmeSummary ?? "")
    && installEvidence(hold.sourceInstall) === installEvidence(entry.install)) return hold;
  const target = reviewedPluginTargets[(entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase()];
  if (target && (target.packageName !== entry.install?.packageName || target.repositoryPath !== (entry.install?.repositoryPath ?? null))) {
    return { sourceDescription: entry.description ?? "", sourceReadme: entry.readmeSummary ?? "", sourceInstall: entry.install,
      reason: "尚未验证已复核的插件包身份，不得恢复旧包的内容或安装信息。" };
  }
  const review = (reviewedDescriptions as Record<string, ReviewedDescription>)[(entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase()];
  if (review?.suspended && matchesReviewedIdentity({ ...entry, install: entry.install ?? undefined }, review.sourceInstall, review.sourceType)
    && review.sourceDescription === (entry.description ?? "") && matchesReviewedReadme(entry.readmeSummary ?? "", review.sourceReadme)) {
    return { sourceDescription: entry.description ?? "", sourceReadme: entry.readmeSummary ?? "", sourceInstall: entry.install,
      reason: "当前来源的内容已被复核撤回，须确认具体插件能力后再恢复。" };
  }
  const packageName = entry.install?.packageName?.toLowerCase() ?? "";
  const repositoryPath = entry.install?.repositoryPath?.toLowerCase() ?? "";
  let reason: string | undefined;
  if (packageName === "@deepseek-ai/dsh-root") {
    reason = "收录目标仍为 DSH 根运行时包，需先确认具体插件及其作者资料。";
  } else if (repositoryPath) {
    const readme = (entry.readmeSummary ?? "").toLowerCase();
    const leaf = packageName.split("/").pop() ?? "";
    const generic = new Set(["core", "client", "server", "runtime", "plugin", "plugins", "index", "main", "dsh", "dsh-root"]);
    const identifiesPackage = (packageName.length >= 4 && !generic.has(packageName) && readme.includes(packageName))
      || (leaf.length >= 4 && !generic.has(leaf) && readme.includes(leaf));
    if (!identifiesPackage && !readme.includes(repositoryPath)) {
      reason = "当前摘要未标明所选子包或路径，需取得子包自身 README 后再生成内容。";
    }
  }
  return reason ? { sourceDescription: entry.description ?? "", sourceReadme: entry.readmeSummary ?? "", sourceInstall: entry.install, reason } : null;
}
export function contentSourceHash(entry: ContentSource, kind: "description" | "categories"): string {
  const fields: unknown[] = [
    kind === "description" ? DESCRIPTION_POLICY_VERSION : CATEGORY_POLICY_VERSION,
    (entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase(), entry.name ?? (entry.fullName ?? entry.id ?? "").split("/").pop(), entry.type, entry.description ?? "", entry.readmeSummary ?? "", entry.topics ?? [],
    entry.install?.packageName ?? null, entry.install?.repositoryPath ?? null,
  ];
  if (reviewedFunctionEvidence[(entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase()]) fields.push(functionEvidenceMarker(entry));
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

export function hasContentEvidence(entry: ContentSource): boolean {
  return [entry.install?.repositoryPath ? "" : entry.description, entry.readmeSummary ?? ""].some(value => {
    const text = cleanDescription(value).replace(/https?:\/\/\S+/g, "").trim();
    return !isPlaceholder(text) && (text.match(/\p{L}/gu)?.length ?? 0) >= 12;
  });
}

export function nextContentAttemptAt(attempts: number, now: number): string {
  return new Date(now + Math.min(7, 2 ** Math.min(Math.max(0, attempts - 1), 3)) * 86_400_000).toISOString();
}
