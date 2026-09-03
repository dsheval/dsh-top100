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
  { id: "ai", label: "Agent 增强", description: "模型能力、提示词、记忆、上下文、多 Agent 协作与智能体增强。" },
  { id: "appearance", label: "外观", description: "主题、皮肤、界面组件、桌面体验、图标与可视化面板。" },
  { id: "coding", label: "编程", description: "代码生成、调试、测试、代码审查、终端、Git 与开发辅助。" },
  { id: "knowledge", label: "知识", description: "联网搜索、浏览器检索、RAG、知识库、文档问答与研究。" },
  { id: "tools", label: "工具", description: "自动化、工作流、连接器、文件处理、通知与效率工具。" },
  { id: "security", label: "安全", description: "权限、沙箱、审计、认证、隐私、密钥与安全防护。" },
] as const;

const CATEGORY_IDS = new Set<PluginCategoryId>(CATEGORY_DEFINITIONS.map(({ id }) => id));
const CATEGORY_SOURCES = new Set(["deepseek", "rule-fallback", "manual"] as const);

const CATEGORY_KEYWORDS: Record<PluginCategoryId, readonly string[]> = {
  ai: ["ai agent", "agentic", "multi-agent", "subagent", "llm", "model", "prompt", "reasoning", "inference", "multimodal", "assistant", "chatbot", "memory", "session", "context", "conversation", "persona", "recall", "模型", "提示词", "推理", "智能体", "多智能体", "子代理", "记忆", "会话", "上下文", "人格"],
  appearance: ["theme", "skin", "appearance", "web ui", "dashboard", "desktop", "wallpaper", "avatar", "visual", "emoji", "icon", "界面", "主题", "皮肤", "外观", "桌面", "看板"],
  coding: ["code", "coding", "developer", "devtools", "terminal", "shell", "cli", "git", "github", "debug", "test", "review", "ide", "编程", "代码", "开发", "终端", "调试", "测试", "审查"],
  knowledge: ["search", "retrieval", "browser", "crawl", "scrape", "research", "lookup", "knowledge", "rag", "wiki", "document", "docs", "notes", "notion", "knowledge base", "搜索", "检索", "浏览器", "网页", "爬虫", "研究", "知识库", "知识", "文档", "笔记", "资料"],
  security: ["security", "secure", "permission", "sandbox", "audit", "guardrail", "auth", "oauth", "privacy", "secret", "安全", "权限", "沙箱", "审计", "认证", "隐私", "密钥"],
  tools: ["automation", "automate", "workflow", "scheduler", "cron", "pipeline", "webhook", "orchestration", "utility", "productivity", "integration", "connector", "notification", "plugin manager", "clipboard", "filesystem", "file manager", "converter", "downloader", "calculator", "translate", "自动化", "工作流", "定时", "流水线", "编排", "实用工具", "效率工具", "集成", "连接器", "通知", "插件管理", "剪贴板", "文件管理", "转换", "下载", "计算器", "翻译"],
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
    if (!Number.isFinite(confidence) || confidence < 0.35 || !evidence) continue;
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

export function fallbackCategoryAssignments(input: {
  name: string;
  fullName?: string;
  description?: string;
  descriptionZh?: string | null;
  readmeSummary?: string | null;
  topics?: string[];
  tags?: string[];
}): PluginCategoryAssignment[] {
  const text = [
    input.name,
    input.fullName,
    input.description,
    input.descriptionZh,
    input.readmeSummary,
    ...(input.topics ?? []),
    ...(input.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const classifiedAt = new Date().toISOString();
  const assignments: PluginCategoryAssignment[] = [];

  for (const definition of CATEGORY_DEFINITIONS) {
    const matched = CATEGORY_KEYWORDS[definition.id].filter((keyword) =>
      textMatchesKeyword(text, keyword)
    );
    if (matched.length === 0) continue;
    assignments.push({
      id: definition.id,
      confidence: Math.min(0.68, 0.44 + matched.length * 0.06),
      evidence: `规则命中：${matched.slice(0, 3).join("、")}`,
      source: "rule-fallback",
      classifiedAt,
    });
  }

  return assignments
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}
