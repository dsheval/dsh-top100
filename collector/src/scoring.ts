/**
 * 实用五维评分（借鉴 StarRadar 潜力分的融合机制，维度重定义为"实用、便捷"导向）
 *
 * 维度与权重（用户确认：维护活跃权重最高，DSH rc 阶段插件易坏）：
 *   maintain  维护活跃  0.30  近 90 天提交 + issue 健康度
 *   practical 实用度    0.25  README/文档/示例完备度
 *   popularity 生态热度 0.20  stars 对数归一化 + fork 参与率（Wilson 小样本稳健）
 *   ease      便捷度    0.15  安装步骤清晰 + 无需额外配置
 *   signal    信号质量  0.10  license/topics/description/README 完备度
 *
 * 融合：加权几何平均（防偏科虚高）+ 贝叶斯置信（字段不全降权）+ 规则解释层
 */

import type { PracticalScore, PracticalScoreBreakdown } from "@dsh-top100/schema";

export interface ScoreInput {
  stars: number;
  forks: number;
  openIssues: number;
  pushedAt: string; // ISO
  hasDescription: boolean;
  hasLicense: boolean;
  hasHomepage: boolean;
  topics: string[];
  readmeContent: string | null;
  hasSkillMd: boolean;
  needsConfig: boolean;
}

const WEIGHTS = {
  maintain: 0.3,
  practical: 0.25,
  popularity: 0.2,
  ease: 0.15,
  signal: 0.1,
} as const;

// ---------- 工具函数 ----------

function log1p(x: number): number {
  return Math.log(1 + x);
}

/** Wilson Score 置信区间下界（小样本比例的稳健估计） */
export function wilsonLowerBound(positives: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const p = positives / total;
  const z2 = z * z;
  return (
    (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) /
    (1 + z2 / total)
  );
}

function clip(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

// ---------- 各维度 ----------

/** 1. 维护活跃：最近提交 + issue 健康度 */
export function scoreMaintain(pushedAt: string, stars: number, openIssues: number): number {
  const days = (Date.now() - new Date(pushedAt).getTime()) / 86_400_000;
  const commitActivity =
    days < 7 ? 1.0 : days < 30 ? 0.8 : days < 90 ? 0.5 : days < 180 ? 0.3 : 0.1;

  // issue 健康度：问题率越低越健康（小样本用 Wilson）
  const issueRate = wilsonLowerBound(openIssues, Math.max(stars, 1));
  const issueHealth = 1 - Math.min(issueRate * 10, 1);

  const score = commitActivity * 0.6 + issueHealth * 0.4;
  return Math.round(clip(score) * 100);
}

/** 2. 实用度：README 结构完备度 */
export function scorePractical(
  readmeContent: string | null,
  hasSkillMd: boolean
): number {
  let s = 0;
  const text = readmeContent ?? "";
  if (text.length > 2000) s += 30;
  else if (text.length > 500) s += 20;
  else if (text.length > 0) s += 10;

  // 有安装/使用说明章节
  if (/(install|installation|usage|getting started|quick start|setup|安装|使用说明|快速开始)/i.test(text)) {
    s += 30;
  }
  // 有代码示例
  const codeBlocks = (text.match(/```/g) ?? []).length;
  if (codeBlocks >= 2) s += 20;
  // 有目录/结构说明
  if (/^#{1,3}\s+(features?|功能)/im.test(text) && /^#{1,3}\s+(config|配置|example|示例)/im.test(text)) {
    s += 10;
  }
  // skill 型有 SKILL.md 本身即是结构化说明
  if (hasSkillMd) s += 10;

  return Math.round(clip(s));
}

/** 3. 生态热度：stars 对数归一化（p99 动态基准）+ fork 参与率 */
export function scorePopularity(
  stars: number,
  forks: number,
  p99Stars: number
): number {
  const starScore = p99Stars > 0 ? 100 * (log1p(stars) / log1p(p99Stars)) : 0;

  // fork 参与率：理想区间 0.1-0.3，过高(刷 fork)或过低(无人参与)都扣分
  const rate = forks / Math.max(stars, 1);
  let forkScore: number;
  if (stars === 0) forkScore = 0;
  else if (rate <= 0.05) forkScore = rate / 0.05 * 40; // 0-40
  else if (rate <= 0.3) forkScore = 40 + ((rate - 0.05) / 0.25) * 50; // 40-90
  else if (rate <= 0.5) forkScore = 90 - ((rate - 0.3) / 0.2) * 40; // 90-50
  else forkScore = Math.max(10, 50 - (rate - 0.5) * 50); // 50 向下

  return Math.round(clip(starScore * 0.6 + forkScore * 0.4));
}

/** 4. 便捷度：安装步骤清晰 + 无需额外配置 */
export function scoreEase(readmeContent: string | null, needsConfig: boolean): number {
  let s = 0;
  const text = readmeContent ?? "";
  // 有明确安装命令
  if (/(git clone|pnpm add|npm install -g|npx skills add|npm i -g|pip install)/i.test(text)) {
    s += 35;
  } else if (/(install|安装)/i.test(text)) {
    s += 15;
  }
  // 无需额外配置
  if (!needsConfig) s += 35;
  // 有结构说明（README 顶部有徽章/描述）
  if (/^#\s+.+/m.test(text) && text.length > 100) s += 30;

  return Math.round(clip(s));
}

/** 5. 信号质量 */
export function scoreSignal(input: {
  hasDescription: boolean;
  hasLicense: boolean;
  hasHomepage: boolean;
  topics: string[];
  readmeContent: string | null;
}): number {
  let s = 0;
  if (input.hasDescription) s += 15;
  if (input.hasLicense) s += 20;
  if (input.hasHomepage) s += 15;
  if (input.topics.length > 0) s += 15;
  if (input.readmeContent && input.readmeContent.length > 100) s += 20;
  if (input.readmeContent && input.readmeContent.length > 500) s += 15;
  return Math.round(clip(s));
}

// ---------- 融合 ----------

/** 加权几何平均（+1 平滑防 0 归零） */
function weightedGeometricMean(scores: Record<keyof typeof WEIGHTS, number>): number {
  const prod = (
    Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]
  ).reduce((acc, k) => acc * Math.pow(scores[k] + 1, WEIGHTS[k]), 1);
  return prod - 1;
}

/** 贝叶斯置信：核心字段齐全度 */
function confidence(input: ScoreInput): number {
  const fields = [
    input.hasDescription,
    input.hasLicense,
    input.readmeContent !== null,
    input.topics.length > 0,
  ].filter(Boolean).length;
  return Math.min(1, fields / 4);
}

// ---------- 解释层 ----------

export function generateExplanation(
  breakdown: PracticalScoreBreakdown,
  stars: number,
  pushedAt: string
): string {
  const reasons: string[] = [];
  const days = Math.round((Date.now() - new Date(pushedAt).getTime()) / 86_400_000);

  if (breakdown.maintain >= 70) {
    reasons.push(days < 30 ? `近 ${Math.max(days, 1)} 天仍在更新，DSH 迭代快也不怕坏` : `维护活跃（${days} 天前有提交）`);
  }
  if (breakdown.practical >= 70) {
    reasons.push("README 含完整安装与使用说明，上手即用");
  }
  if (breakdown.popularity >= 70) {
    reasons.push(`${stars} stars，社区认可度高`);
  }
  if (breakdown.ease >= 70) {
    reasons.push("无需额外配置即可安装，开箱即用");
  }
  if (breakdown.signal >= 70) {
    reasons.push("项目信息完整（license/文档/主题齐全）");
  }

  if (reasons.length === 0) {
    return breakdown.maintain >= 40 ? "维护正常，功能可用" : "新插件，建议查看详情后决定";
  }
  return reasons.slice(0, 3).join("；") + "。";
}

// ---------- 主入口 ----------

export function computePracticalScore(
  input: ScoreInput,
  p99Stars: number
): PracticalScore {
  const maintain = scoreMaintain(input.pushedAt, input.stars, input.openIssues);
  const practical = scorePractical(input.readmeContent, input.hasSkillMd);
  const popularity = scorePopularity(input.stars, input.forks, p99Stars);
  const ease = scoreEase(input.readmeContent, input.needsConfig);
  const signal = scoreSignal({
    hasDescription: input.hasDescription,
    hasLicense: input.hasLicense,
    hasHomepage: input.hasHomepage,
    topics: input.topics,
    readmeContent: input.readmeContent,
  });

  const breakdown: PracticalScoreBreakdown = { maintain, practical, popularity, ease, signal };
  const conf = confidence(input);
  // weightedGeometricMean 返回 0-100 量级，直接乘置信度，无需再 *100
  const total = Math.round(clip(weightedGeometricMean(breakdown) * conf));

  return {
    total,
    breakdown,
    confidence: Math.round(conf * 100) / 100,
    explanation: generateExplanation(breakdown, input.stars, input.pushedAt),
  };
}

/** 计算全量 stars 的 p99（动态基准，避免硬编码） */
export function computeP99Stars(starsList: number[]): number {
  if (starsList.length === 0) return 1;
  const sorted = [...starsList].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
  return Math.max(sorted[idx], 1);
}
