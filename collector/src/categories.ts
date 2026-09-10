import { createHash } from "node:crypto";
import type {
  PluginCategoryAssignment,
  PluginCategoryId,
} from "@dsh-top100/schema";

export interface CategoryDefinition {
  id: PluginCategoryId;
  label: string;
  description: string;
}

export interface CategorySuggestion {
  id: PluginCategoryId;
  confidence: number;
  evidence: string;
}

export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  { id: "ai", label: "Agent 增强", description: "通用模型接入与路由、视觉理解、提示词优化、记忆、上下文管理及跨领域 Agent 编排机制本身。" },
  { id: "appearance", label: "外观", description: "主题、皮肤、图标、桌宠、通用界面布局和独立桌面外壳；不含业务操作面板。" },
  { id: "coding", label: "编程", description: "软件开发、代码生成、调试、测试、代码审查、开发环境、Git 与应用部署。" },
  { id: "knowledge", label: "知识", description: "知识检索、RAG、知识库问答、论文文献、投资分析与研究报告；不含商品比价或插件市场。" },
  { id: "tools", label: "工具", description: "办公和内容创作、浏览器自动化、业务工作流、连接器、文件处理、通知、用量统计、商品比价及插件/技能管理。" },
  { id: "security", label: "安全", description: "以安全为主要用途的渗透测试、漏洞检查、权限控制、沙箱隔离、审计、隐私和密钥防护。" },
] as const;

const CATEGORY_IDS = new Set<PluginCategoryId>(CATEGORY_DEFINITIONS.map(({ id }) => id));
const CATEGORY_SOURCES = new Set(["deepseek", "rule-fallback", "manual"] as const);

/** Bump when classification semantics change; old model/rule caches must not survive. */
export const CATEGORY_POLICY_VERSION = 4;
export interface CategoryInput {
  name: string;
  type?: string;
  fullName?: string;
  description?: string;
  descriptionZh?: string | null;
  readmeSummary?: string | null;
  topics?: string[];
  tags?: string[];
  install?: { packageName?: string; repositoryPath?: string };
}
export function categorySourceHash(input: Pick<CategoryInput, "description" | "readmeSummary" | "topics" | "install">): string {
  return createHash("sha256").update(JSON.stringify([
    CATEGORY_POLICY_VERSION, input.description ?? "", input.readmeSummary ?? "", input.topics ?? [],
    input.install?.packageName ?? "", input.install?.repositoryPath ?? "",
  ])).digest("hex");
}

// High-specificity functional phrases only. Generic agent/code/UI/docs words,
// repository names, topics and generated tags cannot establish a category.
const CATEGORY_KEYWORDS: Record<PluginCategoryId, readonly string[]> = {
  ai: ["multi-agent", "persistent memory", "long-term memory", "context management", "model provider", "prompt optimization", "image understanding", "多模型", "模型接入", "模型路由", "提示词", "推理模式", "多智能体", "子代理编排", "记忆", "上下文管理", "视觉能力", "图像理解"],
  appearance: ["visual theme", "theme plugin", "skin plugin", "desktop app", "desktop client", "wallpaper", "desktop pet", "主题", "皮肤", "壁纸", "桌宠", "桌面客户端", "桌面应用", "界面美化", "透明度"],
  coding: ["code review", "code generation", "code editing", "debugging", "unit testing", "frontend development", "git integration", "代码审查", "代码生成", "代码编辑", "调试", "单元测试", "前端开发", "网页设计", "原型设计", "开发工作台"],
  knowledge: ["web search", "knowledge base", "knowledge retrieval", "research", "rag", "联网搜索", "网页搜索", "知识库", "知识检索", "文档问答", "文献", "学术研究"],
  security: ["security audit", "penetration testing", "access control", "prompt injection detection", "sandbox isolation", "安全审计", "渗透测试", "红队", "权限控制", "权限审批", "沙箱隔离", "安全检查", "密钥保护"],
  tools: ["browser automation", "plugin market", "plugin manager", "file manager", "task manager", "scheduled tasks", "notification", "connector", "clipboard", "calculator", "浏览器自动化", "插件市场", "插件管理", "文件管理", "任务管理", "定时任务", "通知", "连接器", "剪贴板", "计算器", "翻译", "简历", "发票", "小说创作"],
};

function compactEvidence(value: unknown): string {
  return String(value ?? "")
    .replace(/[`#<>\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function textMatchesKeyword(text: string, keyword: string): boolean {
  const normalized = keyword.toLocaleLowerCase();
  if (/[^\x00-\x7F]/.test(normalized)) return text.includes(normalized);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
}

export function normalizeCategorySuggestions(value: unknown): CategorySuggestion[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<PluginCategoryId, CategorySuggestion>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = String(raw.id ?? "") as PluginCategoryId;
    if (!CATEGORY_IDS.has(id)) continue;
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence)));
    const evidence = compactEvidence(raw.evidence);
    if (!Number.isFinite(confidence) || confidence < 0.75 || !evidence) continue;
    const next = { id, confidence: Math.round(confidence * 100) / 100, evidence };
    const current = byId.get(id);
    if (!current || next.confidence > current.confidence) byId.set(id, next);
  }
  return [...byId.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

export function toDeepSeekAssignments(
  suggestions: CategorySuggestion[],
  model: string,
  classifiedAt = new Date().toISOString()
): PluginCategoryAssignment[] {
  return suggestions.map((suggestion) => ({
    ...suggestion,
    source: "deepseek",
    model,
    classifiedAt,
  }));
}

export function normalizeCategoryAssignments(value: unknown): PluginCategoryAssignment[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<PluginCategoryId, PluginCategoryAssignment>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const id = String(raw.id ?? "") as PluginCategoryId;
    const source = String(raw.source ?? "") as PluginCategoryAssignment["source"];
    if (!CATEGORY_IDS.has(id) || !CATEGORY_SOURCES.has(source)) continue;
    const confidence = Math.min(1, Math.max(0, Number(raw.confidence)));
    const evidence = compactEvidence(raw.evidence);
    if (!Number.isFinite(confidence) || !evidence) continue;
    const assignment: PluginCategoryAssignment = {
      id,
      confidence: Math.round(confidence * 100) / 100,
      evidence,
      source,
      ...(raw.model ? { model: compactEvidence(raw.model) } : {}),
      ...(raw.classifiedAt ? { classifiedAt: compactEvidence(raw.classifiedAt) } : {}),
      ...(typeof raw.sourceHash === "string" ? { sourceHash: raw.sourceHash } : {}),
      ...(typeof raw.policyVersion === "number" ? { policyVersion: raw.policyVersion } : {}),
    };
    const current = byId.get(id);
    if (!current || assignment.confidence > current.confidence) byId.set(id, assignment);
  }
  return [...byId.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

export function hasAuthoritativeCategories(
  categories: PluginCategoryAssignment[] | undefined
): boolean {
  return Boolean(categories?.some(({ source }) => source === "deepseek" || source === "manual"));
}

export function currentCategoryAssignments(input: CategoryInput, value: unknown): PluginCategoryAssignment[] {
  const hash = categorySourceHash(input);
  return normalizeCategoryAssignments(value).filter(category =>
    category.sourceHash === hash && category.policyVersion === CATEGORY_POLICY_VERSION
  );
}

export function bindCategoryAssignments(input: CategoryInput, categories: PluginCategoryAssignment[]): PluginCategoryAssignment[] {
  return categories.map(category => ({ ...category, sourceHash: categorySourceHash(input), policyVersion: CATEGORY_POLICY_VERSION }));
}

export function fallbackCategoryAssignments(input: CategoryInput): PluginCategoryAssignment[] {
  const clean = (value: string) => value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]*>/g, " ")
    .split(/[\n。；]/)
    .filter(sentence => !/^(?:\s*[-*>#]\s*)?(?:install|setup|requirements|dependencies|example|安装|依赖|示例|配置步骤)/i.test(sentence.trim()))
    .join(" ").toLowerCase();
  // Prefer the author's short purpose statement; the README is only a fallback.
  const text = clean((input.install?.repositoryPath ? "" : input.description?.trim()) || input.readmeSummary || "");
  const assignments: PluginCategoryAssignment[] = [];
  for (const definition of CATEGORY_DEFINITIONS) {
    const matched = CATEGORY_KEYWORDS[definition.id].filter(keyword => textMatchesKeyword(text, keyword));
    if (!matched.length) continue;
    assignments.push({ id: definition.id, confidence: Math.min(0.68, 0.5 + matched.length * 0.04),
      evidence: `功能短语：${matched.slice(0, 3).join("、")}`, source: "rule-fallback", classifiedAt: new Date().toISOString() });
  }
  // Rule fallback cannot prove multiple independent capabilities. Ambiguous ties
  // remain unclassified and eligible for the model/editorial review queue.
  assignments.sort((a, b) => b.confidence - a.confidence);
  if (assignments.length > 1 && assignments[0].confidence === assignments[1].confidence) return [];
  return bindCategoryAssignments(input, assignments.slice(0, 1));
}
