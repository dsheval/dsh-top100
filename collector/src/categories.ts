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
  { id: "ai", label: "AI增强", description: "模型路由、提示词、推理增强、多模态能力与 AI 助手。" },
  { id: "appearance", label: "外观", description: "主题、皮肤、界面组件、桌面体验、图标与可视化面板。" },
  { id: "memory", label: "记忆", description: "长期记忆、会话历史、上下文管理、人格与状态延续。" },
  { id: "coding", label: "编程", description: "代码生成、调试、测试、代码审查、终端、Git 与开发辅助。" },
  { id: "search", label: "搜索", description: "联网搜索、浏览器、网页抓取、研究与信息检索。" },
  { id: "automation", label: "自动化", description: "工作流、定时任务、自动执行、流水线与跨应用编排。" },
  { id: "knowledge", label: "知识库", description: "知识库、RAG、文档问答、Wiki、笔记与资料管理。" },
  { id: "security", label: "安全", description: "权限、沙箱、审计、认证、隐私、密钥与安全防护。" },
  { id: "tools", label: "工具", description: "通知、连接器、文件处理、效率增强与其他通用实用工具。" },
] as const;

const CATEGORY_IDS = new Set<PluginCategoryId>(CATEGORY_DEFINITIONS.map(({ id }) => id));
const CATEGORY_SOURCES = new Set(["deepseek", "rule-fallback", "manual"] as const);

const CATEGORY_KEYWORDS: Record<PluginCategoryId, readonly string[]> = {
  ai: ["ai agent", "agentic", "llm", "model", "prompt", "reasoning", "inference", "multimodal", "assistant", "chatbot", "模型", "提示词", "推理", "智能体"],
  appearance: ["theme", "skin", "appearance", "web ui", "dashboard", "desktop", "wallpaper", "avatar", "visual", "emoji", "icon", "界面", "主题", "皮肤", "外观", "桌面", "看板"],
  memory: ["memory", "session", "context", "conversation", "history", "persona", "recall", "记忆", "会话", "上下文", "聊天记录", "人格"],
  coding: ["code", "coding", "developer", "devtools", "terminal", "shell", "cli", "git", "github", "debug", "test", "review", "ide", "编程", "代码", "开发", "终端", "调试", "测试", "审查"],
  search: ["search", "retrieval", "browser", "crawl", "scrape", "research", "lookup", "搜索", "检索", "浏览器", "网页", "爬虫", "研究"],
  automation: ["automation", "automate", "workflow", "scheduler", "cron", "pipeline", "webhook", "orchestration", "自动化", "工作流", "定时", "流水线", "编排"],
  knowledge: ["knowledge", "rag", "wiki", "document", "docs", "notes", "notion", "knowledge base", "知识库", "知识", "文档", "笔记", "资料"],
  security: ["security", "secure", "permission", "sandbox", "audit", "guardrail", "auth", "oauth", "privacy", "secret", "安全", "权限", "沙箱", "审计", "认证", "隐私", "密钥"],
  tools: ["utility", "productivity", "integration", "connector", "notification", "plugin manager", "clipboard", "filesystem", "file manager", "converter", "downloader", "calculator", "translate", "实用工具", "效率工具", "集成", "连接器", "通知", "插件管理", "剪贴板", "文件管理", "转换", "下载", "计算器", "翻译"],
};

function compactEvidence(value: unknown): string {
  return String(value ?? "")
    .replace(/[`#<>\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
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
    .slice(0, 4);
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
    .slice(0, 4);
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
      text.includes(keyword.toLocaleLowerCase())
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
    .slice(0, 4);
}
