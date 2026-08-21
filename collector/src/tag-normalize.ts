/**
 * 标签归一化：合并同义/近义标签，删除宽泛标签
 * - 调 DeepSeek 给出同义词合并映射（只合并，不发明新标签）
 * - 应用映射更新所有插件 tags
 * - 输出 data/tag-alias.json 持久化映射（后续增量复用）
 */

import type { DshPlugin } from "@dsh-top100/schema";

/** 宽泛标签黑名单（覆盖绝大多数插件，无筛选价值，直接移除） */
const GENERIC_TAGS = new Set(["效率工具", "开发辅助", "AI 增强", "AI增强"]);

export interface NormalizeResult {
  /** 同义标签 → 主标签 */
  alias: Record<string, string>;
  /** 被移除的宽泛标签计数 */
  removedGeneric: number;
  /** 被合并的标签实例计数 */
  mergedCount: number;
}

function aggregateZhTags(plugins: DshPlugin[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of plugins) {
    for (const t of p.tags) {
      if (!/[\u4e00-\u9fff]/.test(t)) continue;
      if (GENERIC_TAGS.has(t)) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return counts;
}

function buildPrompt(tagList: [string, number][]): string {
  const lines = tagList.map(([t, n]) => `${t} ${n}`).join("\n");
  return `你是 DSH 插件市场的标签管理员。以下是当前插件聚合出的中文功能标签（格式：标签名 使用次数）。

请找出【同义或近义】的标签并合并：
1. 只输出需要合并的映射，格式：{"被合并的标签": "保留的主标签"}
2. 主标签选更通用、更常用、表达更准确的
3. 例：{"AI增强": "AI 增强"}、{"网页自动化": "浏览器自动化"}、{"上下文管理": "会话管理"}
4. 含义不同的标签绝对不要合并
5. 没有把握就不合并（宁可少合并）

标签清单：
${lines}

只输出 JSON，不要任何其他文字。`;
}

export async function normalizeTags(
  plugins: DshPlugin[],
  opts: { apiKey: string; baseURL: string; model: string }
): Promise<NormalizeResult> {
  const counts = aggregateZhTags(plugins);
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  // 只给 LLM 出现 ≥2 次或同义风险高的（单次标签数量太多，全给会超长；给 top 120）
  const llmList = entries.filter(([, n]) => n >= 2).concat(entries.filter(([, n]) => n === 1).slice(0, 80));
  const chunk = llmList.slice(0, 120);

  const prompt = buildPrompt(chunk);
  let alias: Record<string, string> = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${opts.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 2500, // 120 个标签的合并映射可能超过 800 token，防止截断导致 JSON 不完整
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      console.log(`  [normalize] LLM 原始输出长度: ${content.length}，前 80 字: ${content.slice(0, 80)}`);
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        console.log(`  [normalize] parsed 类型: ${typeof parsed}, 键数: ${Object.keys(parsed as object).length}`);
        alias = parsed;
        // 校验：只保留确实存在的标签映射，且目标非空、非同源
        alias = Object.fromEntries(
          Object.entries(alias).filter(([s, t]) => counts.has(s) && t && s !== t)
        );
        // 主标签修正：LLM 可能把「使用次数少」的当主标签（界面增强6 ← 界面美化104）
        // source 明显更常用且 target 未被多个映射指向时，反转方向
        const targetRefs = new Map<string, number>();
        for (const t of Object.values(alias)) {
          targetRefs.set(t, (targetRefs.get(t) ?? 0) + 1);
        }
        for (const [s, t] of Object.entries(alias)) {
          const cs = counts.get(s) ?? 0;
          const ct = counts.get(t) ?? 0;
          if (cs > ct * 3 && (targetRefs.get(t) ?? 0) <= 1) {
            delete alias[s];
            alias[t] = s;
          }
        }
        console.log(`  [normalize] filter 后 alias 键数: ${Object.keys(alias).length}`);
      }
      break;
    } catch (err) {
      if (attempt === 3) {
        console.warn(`  [normalize] LLM 失败: ${(err as Error).message.slice(0, 100)}`);
        alias = {};
      } else {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }

  // 应用映射
  let mergedCount = 0;
  let removedGeneric = 0;
  for (const p of plugins) {
    const next: string[] = [];
    for (const t of p.tags) {
      if (GENERIC_TAGS.has(t)) {
        removedGeneric++;
        continue;
      }
      const target = alias[t];
      if (target && target !== t) {
        mergedCount++;
        if (!next.includes(target)) next.push(target);
      } else {
        next.push(t);
      }
    }
    p.tags = next;
  }

  return { alias, removedGeneric, mergedCount };
}
