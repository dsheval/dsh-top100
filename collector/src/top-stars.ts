/** Fetch and validate the most-starred DSH repository candidates without replacing market data. */

import "./env.js";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InstallMethod } from "@dsh-top100/schema";
import discoveryConfig from "../config/discovery-sources.json";
import {
  fetchRepoRoot,
  githubFetch,
  type GithubRepo,
} from "./github.js";
import { detectPlugin } from "./detect.js";
import { runPool } from "./pool.js";
import { requestGithubCode } from "./sources/github-code-search.js";
import { requestGithubRepositories } from "./sources/github-partitioned-search.js";
import { searchNpmRepositories } from "./sources/npm-search.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../data");
const OUTPUT_FILE = join(DATA_DIR, "top-stars.json");
const EXCLUDED_REPOS = new Set([
  "deepseek-ai/deepseek-harness",
  "deepseek-ai/awesome-deepseek-harness",
]);

interface Candidate {
  fullName: string;
  repo: GithubRepo | null;
  sources: string[];
}

interface PreviousPlugin {
  fullName: string;
  stars: number;
  sources?: string[];
}

interface ValidatedRepository {
  fullName: string;
  name: string;
  owner: string;
  description: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  homepage: string | null;
  license: string | null;
  topics: string[];
  type: "skill" | "cordis-plugin";
  installMethod: InstallMethod;
  evidence: string[];
  sources: string[];
  url: string;
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("DSH_TOP_STARS_LIMIT must be a positive integer");
  }
  return parsed;
}

function addCandidate(
  candidates: Map<string, Candidate>,
  fullName: string,
  repo: GithubRepo | null,
  source: string
): void {
  const key = fullName.toLowerCase();
  if (EXCLUDED_REPOS.has(key)) return;
  const existing = candidates.get(key);
  if (existing) {
    if (repo) existing.repo = repo;
    if (!existing.sources.includes(source)) existing.sources.push(source);
    return;
  }
  candidates.set(key, { fullName, repo, sources: [source] });
}

function loadPreviousTop(limit: number): PreviousPlugin[] {
  try {
    const data = JSON.parse(readFileSync(join(DATA_DIR, "plugins.json"), "utf8")) as {
      plugins?: PreviousPlugin[];
    };
    return [...(data.plugins ?? [])]
      .sort((a, b) => b.stars - a.stars)
      .slice(0, Math.max(300, limit * 3));
  } catch {
    return [];
  }
}

async function validateCandidate(candidate: Candidate): Promise<ValidatedRepository | null> {
  const repo = candidate.repo;
  if (!repo || repo.fork || repo.archived) return null;

  const rootItems = await fetchRepoRoot(repo.full_name, repo.default_branch);
  const detection = await detectPlugin(repo.full_name, rootItems, repo.default_branch);
  if (detection.type !== "cordis-plugin" || !detection.installMethod) return null;
  return {
    fullName: repo.full_name,
    name: repo.name,
    owner: repo.owner.login,
    description: repo.description ?? "",
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    language: repo.language,
    homepage: repo.homepage,
    license: repo.license?.spdx_id ?? null,
    topics: repo.topics,
    type: detection.type,
    installMethod: detection.installMethod,
    evidence: detection.evidence,
    sources: candidate.sources,
    url: `https://github.com/${repo.full_name}`,
    pushedAt: repo.pushed_at,
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
  };
}

async function main(): Promise<void> {
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required");
  const limit = positiveInteger(process.env.DSH_TOP_STARS_LIMIT, 100);
  const candidates = new Map<string, Candidate>();
  const sourceAudit: Array<{
    id: string;
    status: "complete" | "partial" | "failed";
    candidates: number;
    total?: number;
    message?: string;
  }> = [];

  console.log(`=== DSH Star Top ${limit} ===`);
  console.log("[1/4] 召回高 Star 候选...");

  for (const source of discoveryConfig.repositoryQueries) {
    const id = `github-repository:${source.id}`;
    try {
      const result = await requestGithubRepositories(source.query, 1, 100);
      for (const repo of result.items) addCandidate(candidates, repo.full_name, repo, id);
      const complete = result.total_count <= result.items.length;
      sourceAudit.push({
        id,
        status: complete ? "complete" : "partial",
        candidates: result.items.length,
        total: result.total_count,
        message: complete ? undefined : "Fast mode collected the first Star-sorted result page",
      });
      console.log(`  ${id} -> ${result.items.length}/${result.total_count}`);
    } catch (error) {
      sourceAudit.push({ id, status: "failed", candidates: 0, message: (error as Error).message });
      console.warn(`  ${id} failed: ${(error as Error).message}`);
    }
  }

  for (const source of discoveryConfig.codeQueries) {
    const id = `github-code:${source.id}`;
    try {
      const result = await requestGithubCode(source.query, 1, 100);
      for (const item of result.items) {
        addCandidate(candidates, item.repository.full_name, null, id);
      }
      const complete = result.total_count <= result.items.length;
      sourceAudit.push({
        id,
        status: complete ? "complete" : "partial",
        candidates: result.items.length,
        total: result.total_count,
        message: complete ? undefined : "Fast mode collected the first Code Search result page",
      });
      console.log(`  ${id} -> ${result.items.length}/${result.total_count}`);
    } catch (error) {
      sourceAudit.push({ id, status: "failed", candidates: 0, message: (error as Error).message });
      console.warn(`  ${id} failed: ${(error as Error).message}`);
    }
  }

  for (const source of discoveryConfig.npmQueries) {
    const id = `npm:${source.id}`;
    try {
      const result = await searchNpmRepositories(source.query, { maxPages: 2 });
      for (const fullName of result.repositories) addCandidate(candidates, fullName, null, id);
      sourceAudit.push({
        id,
        status: result.complete ? "complete" : "partial",
        candidates: result.repositories.length,
        message: result.complete ? undefined : "Fast mode reached the configured npm page limit",
      });
      console.log(`  ${id} -> ${result.repositories.length}`);
    } catch (error) {
      sourceAudit.push({ id, status: "failed", candidates: 0, message: (error as Error).message });
      console.warn(`  ${id} failed: ${(error as Error).message}`);
    }
  }

  for (const plugin of loadPreviousTop(limit)) {
    const sources = plugin.sources?.length ? plugin.sources : ["previous-catalog"];
    for (const source of sources) addCandidate(candidates, plugin.fullName, null, source);
  }
  console.log(`  去重后候选：${candidates.size}`);

  console.log("[2/4] 刷新候选仓库元数据...");
  let metadataFailures = 0;
  await runPool([...candidates.values()].filter((candidate) => !candidate.repo), async (candidate) => {
    try {
      candidate.repo = await githubFetch<GithubRepo>(`/repos/${candidate.fullName}`);
      candidate.fullName = candidate.repo.full_name;
    } catch {
      metadataFailures++;
    }
  });
  const rankedCandidates = [...candidates.values()]
    .filter((candidate): candidate is Candidate & { repo: GithubRepo } => Boolean(candidate.repo))
    .filter((candidate) => !candidate.repo.fork && !candidate.repo.archived)
    .sort((a, b) => b.repo.stargazers_count - a.repo.stargazers_count);
  console.log(`  可排序候选：${rankedCandidates.length}，元数据失败：${metadataFailures}`);

  console.log("[3/4] 按 Star 降序验证 DSH 插件标记...");
  const validated: ValidatedRepository[] = [];
  const validationFailures: Array<{ fullName: string; message: string }> = [];
  let examined = 0;
  const batchSize = 50;
  for (let offset = 0; offset < rankedCandidates.length && validated.length < limit; offset += batchSize) {
    const batch = rankedCandidates.slice(offset, offset + batchSize);
    await runPool(batch, async (candidate) => {
      try {
        const repository = await validateCandidate(candidate);
        if (repository) validated.push(repository);
      } catch (error) {
        validationFailures.push({
          fullName: candidate.fullName,
          message: (error as Error).message.slice(0, 160),
        });
      }
    });
    examined += batch.length;
    validated.sort((a, b) => b.stars - a.stars);
    console.log(`  已检查 ${examined}，有效 ${validated.length}`);
  }

  const repositories = validated
    .sort((a, b) => b.stars - a.stars || a.fullName.localeCompare(b.fullName))
    .slice(0, limit)
    .map((repository, index) => ({ rank: index + 1, ...repository }));

  console.log("[4/4] 写入结果...");
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    requested: limit,
    returned: repositories.length,
    complete: repositories.length === limit && sourceAudit.every((source) => source.status === "complete"),
    coverage: "fast-top-window",
    coverageNote:
      "Ranks validated repositories recalled from the first high-value window of each source; use the full collector for exhaustive discovery.",
    ordering: "stargazers_count desc",
    candidates: candidates.size,
    candidatesExamined: examined,
    metadataFailures,
    validationFailures: validationFailures.slice(0, 30),
    sources: sourceAudit,
    repositories,
  };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");
  console.log(`  ${OUTPUT_FILE}: ${repositories.length} repositories`);
  if (repositories[0]) {
    console.log(`  #1 ${repositories[0].fullName} (${repositories[0].stars} stars)`);
  }
}

main().catch((error) => {
  console.error("top-stars collector failed:", error);
  process.exitCode = 1;
});
