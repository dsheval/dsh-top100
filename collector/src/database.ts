/** SQLite persistence for repository state, classifications, daily snapshots, and provenance. */

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DshPlugin, MarketData, PluginCategoryAssignment } from "@dsh-top100/schema";
import {
  fallbackCategoryAssignments,
  normalizeCategoryAssignments,
} from "./categories.js";

export interface DatabaseOptions {
  path: string;
}

export interface ImportResult {
  runId: number;
  repositories: number;
  snapshotDate: string;
}

export interface RepositoryRow {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  type: string;
  description: string;
  descriptionZh: string | null;
  readmeSummary: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  homepage: string | null;
  license: string | null;
  topics: string[];
  tags: string[];
  categories: PluginCategoryAssignment[];
  install: DshPlugin["install"];
  sources: string[];
  pushedAt: string;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string;
  raw: DshPlugin;
}

export interface SnapshotRow {
  snapshotDate: string;
  stars: number;
}

export interface CategoryCacheEntry {
  sourceHash: string;
  categories: PluginCategoryAssignment[];
}

export function dateInTimeZone(date = new Date(), timeZone = "Asia/Shanghai"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function categorySourceHash(plugin: Pick<DshPlugin, "readmeSummary" | "description" | "topics">): string {
  return createHash("sha256")
    .update(JSON.stringify([plugin.readmeSummary ?? "", plugin.description ?? "", plugin.topics ?? []]))
    .digest("hex");
}

function summarySourceHash(plugin: DshPlugin): string {
  return createHash("sha256")
    .update(plugin.readmeSummary ?? plugin.description ?? "")
    .digest("hex");
}

export function openDatabase(options: DatabaseOptions): DatabaseSync {
  mkdirSync(dirname(options.path), { recursive: true });
  const database = new DatabaseSync(options.path);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      description_zh TEXT,
      readme_summary TEXT,
      stars INTEGER NOT NULL DEFAULT 0,
      forks INTEGER NOT NULL DEFAULT 0,
      open_issues INTEGER NOT NULL DEFAULT 0,
      language TEXT,
      homepage TEXT,
      license TEXT,
      topics_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      install_json TEXT NOT NULL DEFAULT '{}',
      sources_json TEXT NOT NULL DEFAULT '[]',
      pushed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_checked_at TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      raw_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repository_daily_stats (
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      snapshot_date TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      stars INTEGER NOT NULL,
      forks INTEGER NOT NULL,
      open_issues INTEGER NOT NULL,
      PRIMARY KEY (repository_id, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS repository_summaries (
      repository_id INTEGER PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
      description_zh TEXT,
      source_hash TEXT NOT NULL,
      model TEXT,
      prompt_version TEXT NOT NULL,
      status TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repository_categories (
      repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      confidence REAL NOT NULL,
      evidence TEXT NOT NULL,
      source TEXT NOT NULL,
      model TEXT,
      source_hash TEXT NOT NULL,
      classified_at TEXT NOT NULL,
      PRIMARY KEY (repository_id, category)
    );

    CREATE TABLE IF NOT EXISTS collection_runs (
      id INTEGER PRIMARY KEY,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      snapshot_date TEXT NOT NULL,
      status TEXT NOT NULL,
      repository_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_repositories_active_stars
      ON repositories(active, stars DESC);
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date
      ON repository_daily_stats(snapshot_date, stars DESC);
    CREATE INDEX IF NOT EXISTS idx_repository_categories_category
      ON repository_categories(category, confidence DESC);
  `);
  return database;
}

export function importMarketData(
  database: DatabaseSync,
  market: MarketData,
  options: { snapshotDate?: string; timeZone?: string; model?: string } = {}
): ImportResult {
  const now = new Date().toISOString();
  const snapshotDate = options.snapshotDate ?? dateInTimeZone(new Date(), options.timeZone);
  const run = database
    .prepare("INSERT INTO collection_runs(started_at, snapshot_date, status) VALUES (?, ?, 'running')")
    .run(now, snapshotDate);
  const runId = Number(run.lastInsertRowid);

  const upsertRepository = database.prepare(`
    INSERT INTO repositories (
      full_name, name, owner, type, description, description_zh, readme_summary,
      stars, forks, open_issues, language, homepage, license, topics_json,
      tags_json, install_json, sources_json, pushed_at, created_at, updated_at,
      last_checked_at, first_seen_at, last_seen_at, active, raw_json
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?
    )
    ON CONFLICT(full_name) DO UPDATE SET
      name = excluded.name,
      owner = excluded.owner,
      type = excluded.type,
      description = excluded.description,
      description_zh = COALESCE(excluded.description_zh, repositories.description_zh),
      readme_summary = excluded.readme_summary,
      stars = excluded.stars,
      forks = excluded.forks,
      open_issues = excluded.open_issues,
      language = excluded.language,
      homepage = excluded.homepage,
      license = excluded.license,
      topics_json = excluded.topics_json,
      tags_json = excluded.tags_json,
      install_json = excluded.install_json,
      sources_json = excluded.sources_json,
      pushed_at = excluded.pushed_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      last_checked_at = excluded.last_checked_at,
      last_seen_at = excluded.last_seen_at,
      active = 1,
      raw_json = excluded.raw_json
  `);
  const selectRepositoryId = database.prepare(
    "SELECT id FROM repositories WHERE full_name = ? COLLATE NOCASE"
  );
  const upsertSnapshot = database.prepare(`
    INSERT INTO repository_daily_stats (
      repository_id, snapshot_date, recorded_at, stars, forks, open_issues
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(repository_id, snapshot_date) DO UPDATE SET
      recorded_at = excluded.recorded_at,
      stars = excluded.stars,
      forks = excluded.forks,
      open_issues = excluded.open_issues
  `);
  const upsertSummary = database.prepare(`
    INSERT INTO repository_summaries (
      repository_id, description_zh, source_hash, model, prompt_version, status, generated_at
    ) VALUES (?, ?, ?, ?, 'v1', ?, ?)
    ON CONFLICT(repository_id) DO UPDATE SET
      description_zh = COALESCE(excluded.description_zh, repository_summaries.description_zh),
      source_hash = excluded.source_hash,
      model = excluded.model,
      status = excluded.status,
      generated_at = excluded.generated_at
  `);
  const deleteCategories = database.prepare(
    "DELETE FROM repository_categories WHERE repository_id = ?"
  );
  const insertCategory = database.prepare(`
    INSERT INTO repository_categories (
      repository_id, category, confidence, evidence, source, model, source_hash, classified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("UPDATE repositories SET active = 0");
    for (const plugin of market.plugins) {
      const categories = normalizeCategoryAssignments(plugin.categories);
      plugin.categories = categories.length > 0 ? categories : fallbackCategoryAssignments(plugin);
      upsertRepository.run(
        plugin.fullName,
        plugin.name,
        plugin.owner,
        plugin.type,
        plugin.description,
        plugin.descriptionZh,
        plugin.readmeSummary,
        plugin.stars,
        plugin.forks,
        plugin.openIssues,
        plugin.language,
        plugin.homepage,
        plugin.license,
        JSON.stringify(plugin.topics),
        JSON.stringify(plugin.tags),
        JSON.stringify(plugin.install),
        JSON.stringify(plugin.sources),
        plugin.pushedAt,
        plugin.createdAt,
        plugin.updatedAt,
        plugin.lastCheckedAt,
        now,
        now,
        JSON.stringify(plugin)
      );
      const idRow = selectRepositoryId.get(plugin.fullName) as { id: number } | undefined;
      if (!idRow) throw new Error(`Repository upsert did not return an id: ${plugin.fullName}`);
      upsertSnapshot.run(idRow.id, snapshotDate, now, plugin.stars, plugin.forks, plugin.openIssues);
      upsertSummary.run(
        idRow.id,
        plugin.descriptionZh,
        summarySourceHash(plugin),
        options.model ?? null,
        plugin.descriptionZh ? "generated-or-reused" : "missing",
        now
      );
      deleteCategories.run(idRow.id);
      const inputHash = categorySourceHash(plugin);
      for (const category of plugin.categories) {
        insertCategory.run(
          idRow.id,
          category.id,
          category.confidence,
          category.evidence,
          category.source,
          category.model ?? null,
          inputHash,
          category.classifiedAt ?? now
        );
      }
    }
    database
      .prepare("UPDATE collection_runs SET finished_at = ?, status = 'success', repository_count = ? WHERE id = ?")
      .run(new Date().toISOString(), market.plugins.length, runId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    database
      .prepare("UPDATE collection_runs SET finished_at = ?, status = 'failed', error_message = ? WHERE id = ?")
      .run(new Date().toISOString(), (error as Error).message.slice(0, 1000), runId);
    throw error;
  }

  return { runId, repositories: market.plugins.length, snapshotDate };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readCategoriesByRepository(database: DatabaseSync): Map<number, PluginCategoryAssignment[]> {
  const rows = database
    .prepare("SELECT * FROM repository_categories ORDER BY confidence DESC, category ASC")
    .all() as Array<Record<string, unknown>>;
  const categories = new Map<number, PluginCategoryAssignment[]>();
  for (const row of rows) {
    const repositoryId = Number(row.repository_id);
    const list = categories.get(repositoryId) ?? [];
    list.push({
      id: String(row.category) as PluginCategoryAssignment["id"],
      confidence: Number(row.confidence),
      evidence: String(row.evidence),
      source: String(row.source) as PluginCategoryAssignment["source"],
      ...(row.model ? { model: String(row.model) } : {}),
      ...(row.classified_at ? { classifiedAt: String(row.classified_at) } : {}),
    });
    categories.set(repositoryId, list);
  }
  return categories;
}

export function readCategoryCache(database: DatabaseSync): Map<string, CategoryCacheEntry> {
  const rows = database
    .prepare(`
      SELECT r.full_name, c.*
      FROM repository_categories c
      JOIN repositories r ON r.id = c.repository_id
      ORDER BY c.confidence DESC, c.category ASC
    `)
    .all() as Array<Record<string, unknown>>;
  const cache = new Map<string, CategoryCacheEntry>();
  for (const row of rows) {
    const fullName = String(row.full_name).toLocaleLowerCase();
    const entry = cache.get(fullName) ?? {
      sourceHash: String(row.source_hash),
      categories: [],
    };
    entry.categories.push({
      id: String(row.category) as PluginCategoryAssignment["id"],
      confidence: Number(row.confidence),
      evidence: String(row.evidence),
      source: String(row.source) as PluginCategoryAssignment["source"],
      ...(row.model ? { model: String(row.model) } : {}),
      ...(row.classified_at ? { classifiedAt: String(row.classified_at) } : {}),
    });
    cache.set(fullName, entry);
  }
  return cache;
}

export function readActiveRepositories(database: DatabaseSync): RepositoryRow[] {
  const rows = database
    .prepare("SELECT * FROM repositories WHERE active = 1 ORDER BY stars DESC, full_name ASC")
    .all() as Array<Record<string, unknown>>;
  const categories = readCategoriesByRepository(database);
  return rows.map((row) => ({
    id: Number(row.id),
    fullName: String(row.full_name),
    name: String(row.name),
    owner: String(row.owner),
    type: String(row.type),
    description: String(row.description),
    descriptionZh: row.description_zh ? String(row.description_zh) : null,
    readmeSummary: row.readme_summary ? String(row.readme_summary) : null,
    stars: Number(row.stars),
    forks: Number(row.forks),
    openIssues: Number(row.open_issues),
    language: row.language ? String(row.language) : null,
    homepage: row.homepage ? String(row.homepage) : null,
    license: row.license ? String(row.license) : null,
    topics: parseJson(String(row.topics_json), [] as string[]),
    tags: parseJson(String(row.tags_json), [] as string[]),
    categories: categories.get(Number(row.id)) ?? [],
    install: parseJson(String(row.install_json), {} as DshPlugin["install"]),
    sources: parseJson(String(row.sources_json), [] as string[]),
    pushedAt: String(row.pushed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastCheckedAt: String(row.last_checked_at),
    raw: parseJson(String(row.raw_json), {} as DshPlugin),
  }));
}

export function previousSnapshot(
  database: DatabaseSync,
  repositoryId: number,
  beforeOrOnDate: string,
  inclusive = true
): SnapshotRow | null {
  const operator = inclusive ? "<=" : "<";
  const row = database
    .prepare(
      `SELECT snapshot_date, stars FROM repository_daily_stats
       WHERE repository_id = ? AND snapshot_date ${operator} ?
       ORDER BY snapshot_date DESC LIMIT 1`
    )
    .get(repositoryId, beforeOrOnDate) as { snapshot_date: string; stars: number } | undefined;
  return row ? { snapshotDate: row.snapshot_date, stars: Number(row.stars) } : null;
}
