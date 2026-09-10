/** Source identity and eligibility shared by daily collection and frozen batches. */
import { createHash } from "node:crypto";
import type { InstallInfo } from "@dsh-top100/schema";
import { CATEGORY_POLICY_VERSION } from "./categories.js";
import editorialHolds from "../config/editorial-holds.json";
import { cleanDescription, isPlaceholder } from "../../plugin/src/shared/description-rules.js";

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
  const hold = (editorialHolds as Record<string, EditorialHold>)[(entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase()];
  if (hold && hold.sourceDescription === (entry.description ?? "") && hold.sourceReadme === (entry.readmeSummary ?? "")
    && installEvidence(hold.sourceInstall) === installEvidence(entry.install)) return hold;
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
  return createHash("sha256").update(JSON.stringify([
    kind === "description" ? DESCRIPTION_POLICY_VERSION : CATEGORY_POLICY_VERSION,
    (entry.fullName ?? entry.id ?? entry.name ?? "").toLowerCase(), entry.name ?? (entry.fullName ?? entry.id ?? "").split("/").pop(), entry.type, entry.description ?? "", entry.readmeSummary ?? "", entry.topics ?? [],
    entry.install?.packageName ?? null, entry.install?.repositoryPath ?? null,
  ])).digest("hex");
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
