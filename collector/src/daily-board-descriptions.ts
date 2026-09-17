/** Scheduled descriptions: today's boards first, then the existing daily source scope. */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { DshPlugin } from '@dsh-top100/schema';
import type { RankingsDocument } from './rankings.js';
import type { DescriptionJob } from './description-jobs.js';
import type { ZhEntry } from './zh-util.js';
import { prepareDailyDescriptions, runDailyDescriptions, updateDailyDescriptionCache } from './daily-descriptions.js';
import { bindDailySourceJob } from './daily-model-scope.js';
import { boardDescriptionScope, bindBoardDescriptionJob } from './board-descriptions.js';
import { isDailyBoardRun, isDailySkillsRun, modelRequestsEnabled, withDailyModelRequest } from './model-requests.js';
import { buildTranslationRequest, translateWithDeepSeek, type ZhResult } from './llm.js';
import { hasSkillSourceEvidence, skillsDescriptionScope } from './skills-source-refresh.js';
import { DEFAULT_MODEL, DEFAULT_MODEL_CONCURRENCY, DEFAULT_MODEL_MAX_TOKENS } from './model-defaults.js';

export async function runBoardFirstDescriptions(sources: DshPlugin[], previous: Map<string, DshPlugin>,
  cache: Map<string, ZhEntry>, oldJobs: Record<string, DescriptionJob>, rankings: () => RankingsDocument,
  options: { enabled: boolean; skillsEnabled?: boolean; boardsEnabled?: boolean; limit: number; now: number; worker: (entry: DshPlugin) => Promise<ZhResult | null>;
    invalidOutputs?: ReadonlySet<string>;
    persist: (jobs: Record<string, DescriptionJob>) => void }) {
  const plan = prepareDailyDescriptions(sources, previous, cache, oldJobs, new Set(), options.now);
  const current = rankings();
  const scope = options.boardsEnabled === false ? new Set<string>() : boardDescriptionScope(current);
  const skillsScope = options.skillsEnabled ? skillsDescriptionScope(current) : new Set<string>();
  const eligibleSkill = (entry: DshPlugin) => {
    const old = oldJobs[entry.id], job = plan.jobs[entry.id];
    if (old?.reviewLocked) {
      job.status = 'review-required'; job.reviewLocked = true;
      job.reviewReason = old.reviewReason ?? '既有技能复核暂停仍需定向确认。';
      return false;
    }
    job.attempts = Math.max(job.attempts, old?.attempts ?? 0);
    return hasSkillSourceEvidence(entry)
      && Date.parse(entry.install.discovery!.checkedAt) === options.now
      && bindBoardDescriptionJob(entry, skillsScope, previous, old, job);
  };
  const first = plan.ready.filter(entry => entry.type === 'skill'
    ? skillsScope.has(entry.fullName.toLowerCase()) && eligibleSkill(entry)
    : bindBoardDescriptionJob(entry, scope, previous, oldJobs[entry.id], plan.jobs[entry.id]));
  const second = plan.ready.filter(entry => !scope.has(entry.fullName.toLowerCase())
    && !skillsScope.has(entry.fullName.toLowerCase())
    && bindDailySourceJob(entry, previous, oldJobs[entry.id], plan.jobs[entry.id]));
  const persist = () => {
    for (const id of options.invalidOutputs ?? []) {
      const job = plan.jobs[id];
      if (job) { job.status = 'review-required'; job.reviewLocked = true;
        job.reviewReason = '生成结果未通过中文内容校验，待复核来源或修订简介。'; delete job.nextAttemptAt; }
    }
    options.persist(plan.jobs);
  };
  // Persist eligibility before dispatch; the shared runner persists each attempt and result.
  persist();
  const run = (ready: DshPlugin[], limit: number) => runDailyDescriptions(sources, { jobs: plan.jobs, ready }, {
    limit: options.enabled ? limit : 0, concurrency: DEFAULT_MODEL_CONCURRENCY, worker: options.worker,
    now: () => options.now, onProgress: persist,
  });
  const boards = await run(first, Math.min(options.limit, first.length));
  const daily = await run(second, Math.max(0, options.limit - boards.attempted));
  updateDailyDescriptionCache(sources, cache, plan.jobs);
  persist();
  return { jobs: plan.jobs, scope, skillsScope, boardsReady: first.length, dailyReady: second.length, boards, daily };
}

function readJson<T>(path: string, fallback: T): T {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value)); renameSync(temporary, path);
}

export function readDescriptionJobs(dataDirectory: string): Record<string, DescriptionJob> {
  const value = readJson<{ jobs: Record<string, DescriptionJob> }>(join(dataDirectory, 'description-jobs.json'), { jobs: {} });
  if (!value.jobs || typeof value.jobs !== 'object' || Array.isArray(value.jobs)) throw new Error('Invalid description job state');
  return value.jobs;
}

export async function completeDailyBoardDescriptions(sources: DshPlugin[], previous: Map<string, DshPlugin>,
  dataDirectory: string, rankings: () => RankingsDocument, now: number): Promise<void> {
  const boardsEnabled = isDailyBoardRun(), skillsEnabled = isDailySkillsRun();
  if (!boardsEnabled && !skillsEnabled) return;
  const jobs = readDescriptionJobs(dataDirectory);
  const cached = readJson<{ entries: Record<string, ZhEntry> }>(join(dataDirectory, 'zh-cache.json'), { entries: {} });
  const cache = new Map(Object.entries(cached.entries));
  const limit = Number(process.env.DEEPSEEK_SUMMARY_BATCH_SIZE ?? '300');
  if (!Number.isInteger(limit) || limit < 0 || limit > 3000) throw new Error('Invalid daily description limit');
  const tags = [...new Set(sources.flatMap(source => source.tags.filter(tag => /[\u4e00-\u9fff]/.test(tag))))].slice(0, 40);
  const model = DEFAULT_MODEL;
  const invalidOutputs = new Set<string>();
  const result = await runBoardFirstDescriptions(sources, previous, cache, jobs, rankings, {
    enabled: modelRequestsEnabled(), boardsEnabled, skillsEnabled, limit, now, invalidOutputs,
    persist: jobs => atomicJson(join(dataDirectory, 'description-jobs.json'), { updatedAt: new Date().toISOString(), jobs }),
    worker: source => {
      const input = { name: source.fullName, type: source.type, packageName: source.install.packageName,
        repositoryPath: source.install.repositoryPath, description: source.type === 'skill' ? '' : source.description,
        readmeSummary: source.readmeSummary, topics: source.type === 'skill' ? [] : source.topics, knownTags: tags };
      return withDailyModelRequest(buildTranslationRequest(input, model), () => translateWithDeepSeek(input, {
        apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: process.env.DEEPSEEK_API_BASE ?? 'https://api.deepseek.com',
        model, maxTokens: DEFAULT_MODEL_MAX_TOKENS, maxAttempts: 1, retryDelayMs: 0, timeoutMs: 45_000, thinking: 'disabled',
        onInvalidOutput: () => invalidOutputs.add(source.id),
      }));
    },
  });
  atomicJson(join(dataDirectory, 'zh-cache.json'), { updatedAt: new Date().toISOString(), entries: Object.fromEntries(cache) });
  console.log(`[board-descriptions] ${JSON.stringify({ unique: result.scope.size, skillsUnique: result.skillsScope.size, boardsReady: result.boardsReady,
    dailyReady: result.dailyReady, boards: result.boards, daily: result.daily })}`);
}
