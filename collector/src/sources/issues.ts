/**
 * 数据源 4：本仓库提交插件 issue（label: submission）
 * 原理：读取 open issues 正文 → 正则提取 github.com/owner/repo → 并入候选池
 * 不关闭 issue、不评论（纯只读）；最终收录与否由特征检测决定。
 */

import { githubFetch } from "../github.js";

/** 本仓库（提交插件 issue 所在） */
const MARKET_REPO = "2BingLing/dsh-market";
const SUBMISSION_LABEL = "submission";

interface GithubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels?: Array<{ name?: string }>;
}

/** 从 issue 正文提取 GitHub 仓库地址（兼容多种写法） */
export function extractRepoFromText(text: string): string[] {
  const out: string[] = [];
  // 匹配 github.com/owner/repo（支持 /tree/ /blob/ /issues/ 等后缀）
  const re = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const owner = m[1].toLowerCase();
    const repo = m[2].toLowerCase().replace(/\.git$/, "");
    // 过滤明显非仓库路径（如 github.com 自身、market 仓库自己、GitHub 附件域）
    if (owner === "github" || owner === "2bingling" || owner === "user-attachments") continue;
    if (repo === "issues" || repo === "settings" || repo === "marketplace") continue;
    const fn = `${owner}/${repo}`;
    if (!out.includes(fn)) out.push(fn);
  }
  return out;
}

/** 从 issue 正文提取「作者自述简介」（模板字段：**作者自述简介**：…），取一行
 * 兼容 markdown 加粗（**作者自述**：/ **自定义简介**：）与裸写法（作者自述：） */
export function extractIntroByAuthor(body: string | null): string | undefined {
  if (!body) return undefined;
  // 1) 方括号形式（模板推荐写法，可多行）
  const braced = body.match(
    /(?:作者自述|自定义简介|作者自述简介)\s*\*{0,2}\s*[：:]\s*\[([\s\S]*?)\]/m
  );
  if (braced) {
    const text = braced[1].trim();
    if (text) return text;
  }
  // 2) 裸写法（单行）
  const plain = body.match(
    /(?:作者自述|自定义简介|作者自述简介)\s*\*{0,2}\s*[：:]\s*([^\n\r]+)/
  );
  const text = plain?.[1]?.trim();
  return text || undefined;
}

/** 提交插件 issue 的提取结果 */
export interface SubmissionMeta {
  issueNumbers: number[];
  /** 作者自述简介（可选） */
  introByAuthor?: string;
}

/** 读取本仓库所有 open 的提交插件 issue：返回 fullName(lower) → 元数据（issue 号 + 作者自述） */
export async function fetchSubmissionRepos(): Promise<Map<string, SubmissionMeta>> {
  return fetchSubmissionReposBy(/^\[提交插件\]|^\[submit/i, "submission", "issues:submission");
}

/** 读取本仓库所有 open 的提交整合包 issue（[提交整合包] 标题）→ fullName(lower) → issue 号列表 */
export async function fetchPackSubmissionRepos(): Promise<Map<string, number[]>> {
  return fetchSubmissionReposByPack(/^\[提交整合包\]|^\[submit pack/i, "submission", "issues:pack-submission");
}

async function fetchSubmissionReposBy(
  titleRe: RegExp,
  label: string,
  logTag: string
): Promise<Map<string, SubmissionMeta>> {
  const out = new Map<string, SubmissionMeta>();
  try {
    // label 过滤 + 标题前缀兜底（未打 label 的存量/模板失效 issue 也能命中）
    const issues = await githubFetch<GithubIssue[]>(
      `/repos/${MARKET_REPO}/issues?state=open&per_page=100`
    );
    let counted = 0;
    for (const issue of issues) {
      const isSubmission =
        (issue.labels ?? []).some((l: { name?: string }) => l.name === label) ||
        titleRe.test(issue.title);
      if (!isSubmission) continue;
      counted++;
      const text = `${issue.title}\n${issue.body ?? ""}`;
      const introByAuthor = extractIntroByAuthor(issue.body ?? null);
      for (const fn of extractRepoFromText(text)) {
        const meta = out.get(fn) ?? { issueNumbers: [] };
        if (!meta.issueNumbers.includes(issue.number)) meta.issueNumbers.push(issue.number);
        meta.introByAuthor = meta.introByAuthor ?? introByAuthor;
        out.set(fn, meta);
      }
    }
    console.log(`  ${logTag} -> ${counted} issues, ${out.size} repos`);
    return out;
  } catch (err) {
    // 失败不阻断主流程（issues 只是补充源）
    console.warn(`  issues scan failed: ${(err as Error).message}`);
    return out;
  }
}

async function fetchSubmissionReposByPack(
  titleRe: RegExp,
  label: string,
  logTag: string
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  try {
    const issues = await githubFetch<GithubIssue[]>(
      `/repos/${MARKET_REPO}/issues?state=open&per_page=100`
    );
    let counted = 0;
    for (const issue of issues) {
      const isSubmission =
        (issue.labels ?? []).some((l: { name?: string }) => l.name === label) ||
        titleRe.test(issue.title);
      if (!isSubmission) continue;
      counted++;
      const text = `${issue.title}\n${issue.body ?? ""}`;
      for (const fn of extractRepoFromText(text)) {
        const list = out.get(fn) ?? [];
        if (!list.includes(issue.number)) list.push(issue.number);
        out.set(fn, list);
      }
    }
    console.log(`  ${logTag} -> ${counted} issues, ${out.size} repos`);
    return out;
  } catch (err) {
    console.warn(`  issues scan failed: ${(err as Error).message}`);
    return out;
  }
}
