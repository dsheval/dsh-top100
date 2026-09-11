import { canRequestModel, MODEL_REQUESTS_PAUSED, type ModelRequestControl } from "./model-requests.js";
import { DEFAULT_MODEL, DEFAULT_MODEL_CONCURRENCY, DEFAULT_MODEL_MAX_TOKENS, DEFAULT_MODEL_THINKING, DEFAULT_MODEL_TIMEOUT_MS } from "./model-defaults.js";
/** Local, resumable enrichment. Never writes the input snapshot or publishes remotely.
 * node --use-env-proxy --import tsx collector/src/enrich-catalog.ts INPUT OUTPUT_DIR --dry-run
 */
import "./env.js";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { classifyWithDeepSeek, translateWithDeepSeek } from "./llm.js";
import { DESCRIPTION_POLICY_VERSION, enrichedSnapshot, enrichmentProgress, enrichmentSourceHash, planCatalogEnrichment, runCatalogEnrichment, type EnrichmentState, type EnrichmentTask } from "./catalog-enrichment.js";
import { CATEGORY_POLICY_VERSION } from "./categories.js";
import { publishRankings } from "./publish-rankings.js";
import type { RankingEntry, RankingsDocument } from "./rankings.js";

function canonicalPath(path: string): string {
  return existsSync(path) ? realpathSync(path) : join(canonicalPath(dirname(path)), basename(path));
}
function atomicFile(path: string, content: string): void {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content);
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
function atomicJson(path: string, data: unknown): void { atomicFile(path, JSON.stringify(data, null, 2) + "\n"); }
export function loadEnrichmentState(path: string, journalPath: string, document: RankingsDocument): EnrichmentState | undefined {
  if (!existsSync(path) && !existsSync(journalPath)) return undefined;
  const parsed = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as EnrichmentState : { schemaVersion: 1 as const, jobs: {} };
  if (parsed.schemaVersion !== 1 || !parsed.jobs || typeof parsed.jobs !== "object" || Array.isArray(parsed.jobs)) {
    throw new Error("Unsupported enrichment-state.json; keep it for inspection and use a fresh output directory");
  }
  if (existsSync(journalPath)) {
    const entries = new Map([...document.rankings.total, ...(document.directories?.skills ?? [])].map(entry => [entry.fullName.toLowerCase(), entry]));
    const raw = readFileSync(journalPath, "utf8");
    const lines = raw.split("\n");
    // An interrupted append may leave only the final line incomplete. Earlier corruption is an error.
    if (!raw.endsWith("\n")) lines.pop();
    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line) as Pick<EnrichmentTask, "fullName" | "kind" | "job">;
      if (typeof event.fullName !== "string" || !["description", "categories"].includes(event.kind)
        || !event.job || typeof event.job.sourceHash !== "string") throw new Error("Invalid enrichment journal record");
      const entry = entries.get(event.fullName);
      if (!entry || event.job.sourceHash !== enrichmentSourceHash(entry, event.kind)
        || event.job.policyVersion !== (event.kind === "description" ? DESCRIPTION_POLICY_VERSION : CATEGORY_POLICY_VERSION)) continue;
      parsed.jobs[event.fullName] ??= {} as EnrichmentState["jobs"][string];
      parsed.jobs[event.fullName][event.kind] = event.job;
    }
  }
  return parsed;
}
function numericOption(raw: string, name: string, minimum: number, maximum: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  return value;
}
function modelInput(entry: RankingEntry) {
  return { name: entry.fullName, type: entry.type, description: entry.description, readmeSummary: entry.readmeSummary ?? null, topics: entry.topics ?? [], packageName: entry.install?.packageName, repositoryPath: entry.install?.repositoryPath };
}

export async function enrichCatalogCli(args: string[], control: ModelRequestControl = {}): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    "dry-run": { type: "boolean", default: false },
    kind: { type: "string", default: "all" },
    limit: { type: "string", default: "100" }, concurrency: { type: "string", default: String(DEFAULT_MODEL_CONCURRENCY) },
    model: { type: "string" }, "base-url": { type: "string" },
  } });
  if (positionals.length !== 2) throw new Error("Usage: enrich-catalog.ts INPUT OUTPUT_DIR [--dry-run] [--kind all|description|categories] [--limit 100] [--concurrency 3] [--model MODEL] [--base-url URL]");
  const kind = values.kind ?? "all";
  if (kind !== "all" && kind !== "description" && kind !== "categories") throw new Error("kind must be all, description or categories");
  const input = realpathSync(resolve(positionals[0]));
  const output = canonicalPath(resolve(positionals[1]));
  const inside = relative(output, input);
  if (!inside || (!inside.startsWith("..") && !isAbsolute(inside))) throw new Error("Keep the frozen input outside the enrichment output directory");
  const limit = numericOption(values.limit!, "limit", 0, 100_000);
  const concurrency = numericOption(values.concurrency!, "concurrency", 1, 256);
  const raw = readFileSync(input, "utf8");
  const document = JSON.parse(raw) as RankingsDocument;
  const statePath = join(output, "enrichment-state.json");
  const journalPath = join(output, "enrichment-journal.jsonl");
  let plan = planCatalogEnrichment(document, loadEnrichmentState(statePath, journalPath, document), Date.now());
  const inputSha256 = createHash("sha256").update(raw).digest("hex");
  const metadata = { input, inputSha256, sourceGeneratedAt: document.generatedAt, kind, limit, concurrency };
  const scheduledJobs = Math.min(limit, plan.ready.filter(task => kind === "all" || task.kind === kind).length);
  if (values["dry-run"]) {
    console.log(JSON.stringify({ ...metadata, dryRun: true, ...enrichmentProgress(plan, Date.now()), scheduledJobs }, null, 2));
    return;
  }
  if (scheduledJobs > 0 && !canRequestModel(control)) throw new Error(MODEL_REQUESTS_PAUSED);
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (scheduledJobs > 0 && !apiKey) throw new Error("DEEPSEEK_API_KEY is required for model jobs; use --dry-run for read-only statistics");
  const model = values.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const baseURL = values["base-url"] ?? process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
  const endpoint = new URL(baseURL);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("The model base URL must use HTTPS and contain no credentials, query or fragment");
  }
  mkdirSync(output, { recursive: true });
  const lock = join(output, ".enrichment.lock");
  // Recover interrupted runs only when their process no longer exists.
  if (existsSync(lock)) {
    const owner = JSON.parse(readFileSync(lock, "utf8")) as { pid: number };
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error("Invalid enrichment lock; inspect it before resuming");
    try { process.kill(owner.pid, 0); throw new Error("Another enrichment process owns this output directory"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      rmSync(lock);
    }
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  try {
    // A previous process may have finished between the initial read and lock acquisition.
    plan = planCatalogEnrichment(document, loadEnrichmentState(statePath, journalPath, document), Date.now());
    let journalEvents = 0;
    const persist = (task?: EnrichmentTask) => {
      if (task) {
        appendFileSync(journalPath, JSON.stringify({ fullName: task.fullName, kind: task.kind, job: task.job }) + "\n");
        journalEvents++;
      }
      if (!task || journalEvents >= 100) {
        atomicJson(statePath, plan.state);
        // Clear only after the replacement checkpoint is durable to the process.
        atomicFile(journalPath, "");
        journalEvents = 0;
      }
      atomicJson(join(output, "enrichment-progress.json"), { ...metadata, model, updatedAt: new Date().toISOString(), ...enrichmentProgress(plan, Date.now()) });
    };
    persist();
    const request = { ...control, apiKey: apiKey ?? "", baseURL: baseURL.replace(/\/$/, ""), model, maxAttempts: 1, retryDelayMs: 0,
      maxTokens: DEFAULT_MODEL_MAX_TOKENS, timeoutMs: DEFAULT_MODEL_TIMEOUT_MS, thinking: DEFAULT_MODEL_THINKING };
    const result = await runCatalogEnrichment(plan, { kind, limit, concurrency, model,
      workers: { translate: entry => translateWithDeepSeek(modelInput(entry), request), classify: entry => classifyWithDeepSeek(modelInput(entry), request) },
      onProgress: persist,
    });
    const manifest = publishRankings(enrichedSnapshot(plan), join(output, "snapshot"));
    persist();
    console.log(JSON.stringify({ ...metadata, ...result, ...enrichmentProgress(plan, Date.now()), snapshotId: manifest.snapshotId, snapshotDirectory: join(output, "snapshot") }, null, 2));
  } finally { rmSync(lock, { force: true }); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  enrichCatalogCli(process.argv.slice(2)).catch(error => {
    // Provider errors are consumed by the workers; this reports local validation failures only.
    console.error(error instanceof Error ? error.message : "Catalog enrichment failed");
    process.exitCode = 1;
  });
}
