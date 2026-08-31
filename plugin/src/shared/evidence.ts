/** Conservative, explainable catalog classification. It never claims a security review. */

import { isCordisEntry, resolveInstallSpec } from "../install/install-spec.js";
import type {
  CatalogEvidence,
  CatalogEvidenceSignalCode,
  CatalogFormFactor,
  RankingEntry,
} from "./types.js";

const THEME_RE = /(?:^|[-_\s])(theme|skin|appearance|retro|dark|light)(?:$|[-_\s])/i;
const DESKTOP_RE = /(?:desktop|electron|menubar|tray|macos|windows app|客户端|桌面应用)/i;
const MCP_RE = /(?:^|[-_\s])mcp(?:$|[-_\s])|model context protocol/i;

function evidenceText(entry: RankingEntry): string {
  return [
    entry.type,
    entry.name,
    entry.description,
    entry.descriptionZh,
    ...(entry.tags ?? []),
    ...(entry.topics ?? []),
  ].join(" ");
}

export function classifyFormFactor(entry: RankingEntry): CatalogFormFactor {
  const type = entry.type?.toLowerCase() ?? "";
  const text = evidenceText(entry);
  if (type === "skill") return /dsh|deepseek harness/i.test(text) ? "dsh-skill" : "agent-skill";
  if (isCordisEntry(entry) && resolveInstallSpec(entry)) return THEME_RE.test(text) ? "theme" : "dsh-bundle";
  if (DESKTOP_RE.test(text)) return "desktop-app";
  if (isCordisEntry(entry)) return THEME_RE.test(text) ? "theme" : "dsh-bundle";
  if (THEME_RE.test(text)) return "theme";
  if (MCP_RE.test(text)) return "mcp-integration";
  if (/dsh|deepseek harness/i.test(text)) return "ecosystem-project";
  return "candidate";
}

export function catalogEvidence(entry: RankingEntry): CatalogEvidence {
  const formFactor = classifyFormFactor(entry);
  const installSpec = resolveInstallSpec(entry);
  const cordisStructure = isCordisEntry(entry);
  const skillStructure = entry.type?.toLowerCase() === "skill";
  const structured = cordisStructure || skillStructure;
  const signalCodes: CatalogEvidenceSignalCode[] = ["indexed"];
  const signals = ["已进入 DSHEval 索引"];
  if (structured) {
    const structureCode: CatalogEvidenceSignalCode = formFactor === "dsh-skill" ? "dsh-skill"
      : formFactor === "agent-skill" ? "agent-skill"
        : formFactor === "theme" ? "theme-bundle"
          : "dsh-bundle";
    signalCodes.push(structureCode);
    signals.push(
      formFactor === "dsh-skill" ? "声明为 DSH Skill"
        : formFactor === "agent-skill" ? "声明为通用 Agent Skill"
          : formFactor === "theme" ? "命中 DSH/Cordis 主题 Bundle 结构"
            : "命中 DSH Bundle 结构",
    );
  }
  if (installSpec) {
    signalCodes.push("install-source");
    signals.push(`安装源可解析（${installSpec.kind}）`);
  }
  return {
    formFactor,
    compatible: structured,
    trustLevel: installSpec ? "install-source" : structured ? "structured" : "indexed",
    signalCodes,
    caveatCode: "not-security-review",
    signals,
    caveat: "这些证据不代表代码已通过安全审核；安装前仍需核对精确来源、脚本与权限。",
  };
}
