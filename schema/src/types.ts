/**
 * DSH Market 共享数据类型（schema 包）
 * collector 生成、web 与 plugin 消费，三端必须遵守同一份定义。
 */

/** 插件形态 */
export type PluginType = "skill" | "cordis-plugin";

/** 分类榜使用的受控分类；一个仓库可以同时属于多个分类。 */
export type PluginCategoryId =
  | "ai"
  | "appearance"
  | "memory"
  | "coding"
  | "search"
  | "automation"
  | "knowledge"
  | "security"
  | "tools";

export type PluginCategorySource = "deepseek" | "rule-fallback" | "manual";

export interface PluginCategoryAssignment {
  id: PluginCategoryId;
  /** 分类置信度 0-1。 */
  confidence: number;
  /** 来自 README、描述或 topics 的简短依据。 */
  evidence: string;
  source: PluginCategorySource;
  model?: string;
  classifiedAt?: string;
}

/** 一键安装方式 */
export type InstallMethod =
  | "skills-add" // git clone 到 ~/.agents/skills（skill 型）
  | "pnpm-profile" // 在目标 profile 中 pnpm add + patch（cordis 插件型）
  | "git-clone"; // 通用 clone（暂未细分）

/** 实用五维评分明细 */
export interface PracticalScoreBreakdown {
  /** 维护活跃 0-100 */
  maintain: number;
  /** 实用度 0-100 */
  practical: number;
  /** 生态热度 0-100 */
  popularity: number;
  /** 便捷度 0-100 */
  ease: number;
  /** 信号质量 0-100 */
  signal: number;
}

export interface PracticalScore {
  /** 融合后的总分 0-100 */
  total: number;
  breakdown: PracticalScoreBreakdown;
  /** 数据置信度 0-1（字段不全/样本少时降权） */
  confidence: number;
  /** 解释层："为什么推荐"的自然语言理由 */
  explanation: string;
}

export interface InstallInfo {
  method: InstallMethod;
  /** skill 型：~/.agents/skills；cordis 型：profile 名 */
  target?: string;
  /** 是否需要 token / API key 等额外配置 */
  needsConfig: boolean;
  /** 从 README 安装章节解析出的真实安装命令（精确命令优先于模板） */
  commands?: string[];
  /** 命令来源（README 安装章节 / 模板兜底） */
  commandSource?: string;
}

export interface DshPlugin {
  /** 唯一标识 owner/repo（同仓库多技能时用 owner/repo@skill-name） */
  id: string;
  type: PluginType;
  name: string;
  owner: string;
  repo: string;
  fullName: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  description: string;
  descriptionZh: string | null;
  /** 功能标签（LLM 打标 + 关键词兜底） */
  tags: string[];
  /** README 语义分类；允许一个仓库进入多个分类榜。 */
  categories?: PluginCategoryAssignment[];
  /** 人工精选标记 */
  curated: boolean;
  /** 精选推荐理由（人工填写） */
  curatedReason?: string;
  homepage: string | null;
  license: string | null;
  topics: string[];
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
  /** README 摘要（截断，供详情页展示） */
  readmeSummary: string | null;
  /** 作者自述简介（插件提交时提供，可选；Web 详情页 C 位展示，区分于自动简介） */
  introByAuthor?: string;
  /** 提交该插件的 issue 号（供详情页/安装区跳转讨论，可选） */
  submissionIssue?: number;
  /** 安装相关信息 */
  install: InstallInfo;
  /** 实用五维评分 */
  score: PracticalScore;
  /** 数据源（awesome/topic/org/user-submit） */
  sources: string[];
  lastCheckedAt: string;
}

/** 整合包条目类型（协议 v0.1 语义：skill/cordis/bundle/pack） */
export type PackEntryType = "skill" | "cordis" | "bundle" | "pack";

/** 整合包条目（包内一个插件/技能/子包） */
export interface PackEntry {
  /** owner/repo | npm 包名 | bundle id */
  id: string;
  type: PackEntryType;
  /** latest / semver 范围 / 日期锚点 / commit（协议 v0.1） */
  version: string;
  /** 条目解析状态（市场侧每日校验产物） */
  resolved?: {
    ok: boolean;
    /** 是否已在 plugins.json 收录 */
    inMarket: boolean;
    /** 命中市场里的插件 id */
    matchId?: string;
    reason?: string;
  };
}

/** 整合包（市场收录视图） */
export interface DshPack {
  /** 唯一标识 owner/repo */
  id: string;
  name: string;
  description: string;
  descriptionZh: string | null;
  /** GitHub 语义作者 */
  author: string;
  /** 协议版本（校验用） */
  schemaVersion: number;
  /** 包形态：dsh-pack（协议清单）/ loose-pack（README 信号，宽松收录）/ 协议自定义值 */
  kind: string;
  entries: PackEntry[];
  entryStats: {
    total: number;
    ok: number;
    failed: number;
    inMarket: number;
  };
  tags: string[];
  stars: number;
  curated: boolean;
  curatedReason?: string;
  homepage: string | null;
  license: string | null;
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
  readmeSummary: string | null;
  /** 实用五维评分（包维度输入） */
  score: PracticalScore;
  /** 数据源（pack-search / pack-known / user-submit） */
  sources: string[];
  lastCheckedAt: string;
}

export interface MarketData {
  schemaVersion: number;
  generatedAt: string;
  plugins: DshPlugin[];
  /** 整合包通道（v2 新增；旧数据缺省为空数组） */
  packs?: DshPack[];
}
