/** Build and atomically publish immutable, paginated v2 ranking snapshots. */

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  PluginCategoryId,
  RankingCategoryManifest,
  RankingFileReference,
  RankingListSnapshot,
  RankingManifestV2,
  RankingPageReference,
  RankingPageSnapshot,
  RankingSearchSnapshot,
  RankingSummaryEntry,
} from "@dsh-top100/schema";
import { CATEGORY_DEFINITIONS } from "./categories.js";
import type { RankingEntry, RankingsDocument } from "./rankings.js";
import { buildSearchIndex, buildSnapshotSearchEntries } from "./search-index.js";

export const RANKING_PAGE_SIZE = 100;
export const RANKING_PUBLICATION_FORMAT = "ranking-static-v2.5";

export interface RankingPublicationOptions {
  pageSize?: number;
  /** Public URL that maps to publicDirectory. */
  publicUrlPrefix?: string;
}

export interface RankingPublicationFile {
  /** Path relative to `/data/snapshots/{snapshotId}/`. */
  relativePath: string;
  content: string;
}

export interface RankingPublication {
  manifest: RankingManifestV2;
  files: RankingPublicationFile[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compactJson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizePublicUrlPrefix(value: string): string {
  const normalized = `/${value.trim().replace(/^\/+|\/+$/g, "")}`;
  if (normalized === "/" || normalized.split("/").includes("..")) {
    throw new Error(`Invalid public ranking URL prefix: ${value}`);
  }
  return normalized;
}

function assertPageSize(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 1000) {
    throw new Error("Ranking pageSize must be an integer from 1 to 1000");
  }
}

function snapshotIdFor(rankings: RankingsDocument): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rankings.snapshotDate)) {
    throw new Error(`Invalid ranking snapshotDate: ${rankings.snapshotDate}`);
  }
  const digest = sha256(`${RANKING_PUBLICATION_FORMAT}\n${compactJson(rankings)}`).slice(0, 16);
  return `${rankings.snapshotDate}-${digest}`;
}

function toSummaryEntry(entry: RankingEntry, rank = entry.rank): RankingSummaryEntry {
  return {
    rank,
    totalRank: entry.totalRank,
    fullName: entry.fullName,
    name: entry.name,
    description: entry.description,
    ...(entry.descriptionZh && entry.descriptionZh !== entry.description
      ? { descriptionZh: entry.descriptionZh }
      : {}),
    ...(entry.readmeSummary ? { readmeSummary: entry.readmeSummary } : {}),
    stars: entry.stars,
    dailyStars: entry.dailyStars,
    weeklyStars: entry.weeklyStars,
    hotScore: entry.hotScore,
    openIssues: entry.openIssues,
    language: entry.language,
    homepage: entry.homepage,
    license: entry.license,
    topics: entry.topics,
    tags: entry.tags,
    categories: entry.categories.map(({ id }) => id),
    type: entry.type,
    install: entry.install,
    url: entry.url,
    pushedAt: entry.pushedAt,
  };
}

function pageFileName(page: number): string {
  return `page-${String(page).padStart(3, "0")}.json`;
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function allFileReferences(manifest: RankingManifestV2): RankingFileReference[] {
  return [
    manifest.datasets.hot,
    manifest.datasets.rising,
    manifest.datasets.skills,
    manifest.datasets.search,
    ...manifest.datasets.total.pages,
    ...manifest.categories.flatMap(({ pages }) => pages),
  ];
}

/**
 * Create a deterministic in-memory publication. No filesystem state is changed,
 * which keeps pagination and contract tests fast and hermetic.
 */
export function buildRankingPublication(
  rankings: RankingsDocument,
  options: RankingPublicationOptions = {}
): RankingPublication {
  const pageSize = options.pageSize ?? RANKING_PAGE_SIZE;
  assertPageSize(pageSize);
  const publicUrlPrefix = normalizePublicUrlPrefix(options.publicUrlPrefix ?? "/data");
  const snapshotId = snapshotIdFor(rankings);
  const snapshotUrl = `${publicUrlPrefix}/snapshots/${snapshotId}`;
  const files: RankingPublicationFile[] = [];

  function addFile(relativePath: string, value: unknown, count: number): RankingFileReference {
    const content = compactJson(value);
    files.push({ relativePath, content });
    return {
      url: `${snapshotUrl}/${relativePath}`,
      count,
      bytes: Buffer.byteLength(content),
      sha256: sha256(content),
    };
  }

  const hotEntries = rankings.rankings.hot.map((entry) => toSummaryEntry(entry));
  const hotSnapshot: RankingListSnapshot = {
    schemaVersion: 2,
    snapshotId,
    generatedAt: rankings.generatedAt,
    snapshotDate: rankings.snapshotDate,
    dataset: "hot",
    total: hotEntries.length,
    rankings: hotEntries,
  };
  const hot = addFile("hot.json", hotSnapshot, hotEntries.length);

  const risingEntries = rankings.rankings.rising.map((entry) => toSummaryEntry(entry));
  const risingSnapshot: RankingListSnapshot = {
    schemaVersion: 2,
    snapshotId,
    generatedAt: rankings.generatedAt,
    snapshotDate: rankings.snapshotDate,
    dataset: "rising",
    total: risingEntries.length,
    rankings: risingEntries,
  };
  const rising = addFile("rising.json", risingSnapshot, risingEntries.length);

  const skillEntries = (rankings.directories?.skills ?? []).map((entry, index) =>
    toSummaryEntry(entry, index + 1)
  );
  const skillsSnapshot: RankingListSnapshot = {
    schemaVersion: 2,
    snapshotId,
    generatedAt: rankings.generatedAt,
    snapshotDate: rankings.snapshotDate,
    dataset: "skills",
    total: skillEntries.length,
    rankings: skillEntries,
  };
  const skills = addFile("skills.json", skillsSnapshot, skillEntries.length);

  const totalEntries = rankings.rankings.total.map((entry) => toSummaryEntry(entry));
  const totalPageCount = Math.ceil(totalEntries.length / pageSize);
  const totalPages: RankingPageReference[] = [];
  for (let page = 1; page <= totalPageCount; page += 1) {
    const pageEntries = totalEntries.slice((page - 1) * pageSize, page * pageSize);
    const relativePath = `total/${pageFileName(page)}`;
    const payload: RankingPageSnapshot = {
      schemaVersion: 2,
      snapshotId,
      generatedAt: rankings.generatedAt,
      snapshotDate: rankings.snapshotDate,
      dataset: "total",
      page,
      pageSize,
      pageCount: totalPageCount,
      total: totalEntries.length,
      rankings: pageEntries,
    };
    totalPages.push({ page, ...addFile(relativePath, payload, pageEntries.length) });
  }

  const categoryManifests: RankingCategoryManifest[] = CATEGORY_DEFINITIONS.map(
    (definition) => {
      const categoryEntries = rankings.rankings.total
        .filter((entry) => entry.categories.some(({ id }) => id === definition.id))
        .map((entry, index) => toSummaryEntry(entry, index + 1));
      const pageCount = Math.ceil(categoryEntries.length / pageSize);
      const pages: RankingPageReference[] = [];
      for (let page = 1; page <= pageCount; page += 1) {
        const pageEntries = categoryEntries.slice((page - 1) * pageSize, page * pageSize);
        const relativePath = `categories/${definition.id}/${pageFileName(page)}`;
        const payload: RankingPageSnapshot = {
          schemaVersion: 2,
          snapshotId,
          generatedAt: rankings.generatedAt,
          snapshotDate: rankings.snapshotDate,
          dataset: "category",
          category: definition.id,
          page,
          pageSize,
          pageCount,
          total: categoryEntries.length,
          rankings: pageEntries,
        };
        pages.push({ page, ...addFile(relativePath, payload, pageEntries.length) });
      }
      return {
        ...definition,
        count: categoryEntries.length,
        skillCount: categoryEntries.filter((entry) => entry.type === "skill").length,
        pageSize,
        pageCount,
        pages,
      };
    }
  );

  const searchEntries = buildSnapshotSearchEntries(rankings);
  const searchSnapshot: RankingSearchSnapshot = {
    schemaVersion: 2,
    snapshotId,
    generatedAt: rankings.generatedAt,
    snapshotDate: rankings.snapshotDate,
    dataset: "search",
    total: searchEntries.length,
    rankings: searchEntries,
  };
  const search = addFile("search.json", searchSnapshot, searchEntries.length);

  const manifest: RankingManifestV2 = {
    schemaVersion: 2,
    snapshotId,
    generatedAt: rankings.generatedAt,
    snapshotDate: rankings.snapshotDate,
    pageSize,
    definitions: rankings.definitions,
    datasets: {
      hot,
      rising,
      skills,
      search,
      total: {
        count: totalEntries.length,
        skillCount: totalEntries.filter((entry) => entry.type === "skill").length,
        pageSize,
        pageCount: totalPageCount,
        pages: totalPages,
      },
    },
    categories: categoryManifests,
  };

  const publication = { manifest, files };
  validateRankingPublication(publication);
  return publication;
}

/** Validate hashes and cross-file snapshot/rank invariants before anything is published. */
export function validateRankingPublication(publication: RankingPublication): void {
  const { manifest, files } = publication;
  if (manifest.schemaVersion !== 2) {
    throw new Error(`Unsupported ranking manifest schema: ${manifest.schemaVersion}`);
  }
  if (!manifest.datasets.hot.url.endsWith("/hot.json")) {
    throw new Error("Ranking hot URL does not identify hot.json");
  }
  const prefix = manifest.datasets.hot.url.slice(
    0,
    manifest.datasets.hot.url.length - "hot.json".length
  );
  const byPath = new Map(files.map((file) => [file.relativePath, file.content]));
  const references = allFileReferences(manifest);
  if (references.length !== files.length || byPath.size !== files.length) {
    throw new Error("Ranking publication contains unreferenced or duplicate files");
  }

  for (const reference of references) {
    if (!reference.url.startsWith(prefix)) {
      throw new Error(`Ranking file URL is outside snapshot: ${reference.url}`);
    }
    const relativePath = reference.url.slice(prefix.length);
    const content = byPath.get(relativePath);
    if (content === undefined) throw new Error(`Ranking file is missing: ${relativePath}`);
    if (Buffer.byteLength(content) !== reference.bytes || sha256(content) !== reference.sha256) {
      throw new Error(`Ranking file hash or byte size mismatch: ${relativePath}`);
    }
    const payload = JSON.parse(content) as {
      schemaVersion?: number;
      snapshotId?: string;
      generatedAt?: string;
      snapshotDate?: string;
      rankings?: RankingSummaryEntry[];
    };
    if (
      payload.schemaVersion !== 2 ||
      payload.snapshotId !== manifest.snapshotId ||
      payload.generatedAt !== manifest.generatedAt ||
      payload.snapshotDate !== manifest.snapshotDate
    ) {
      throw new Error(`Ranking file belongs to a different snapshot: ${relativePath}`);
    }
    if (!Array.isArray(payload.rankings) || payload.rankings.length !== reference.count) {
      throw new Error(`Ranking file count mismatch: ${relativePath}`);
    }
  }

  type RankedEntry = Pick<RankingSummaryEntry, "rank" | "fullName" | "categories" | "type">;

  function entriesFor(reference: RankingFileReference): RankedEntry[] {
    const relativePath = reference.url.slice(prefix.length);
    const payload = JSON.parse(byPath.get(relativePath) ?? "null") as {
      rankings: RankedEntry[];
    };
    return payload.rankings;
  }

  function assertRankSequence(
    name: string,
    entries: RankedEntry[],
    expectedCount: number,
    category?: PluginCategoryId
  ): void {
    if (entries.length !== expectedCount) {
      throw new Error(`${name} entry total does not match manifest count`);
    }
    const names = new Set<string>();
    entries.forEach((entry, index) => {
      if (entry.rank !== index + 1) {
        throw new Error(`${name} rank is not continuous at ${index + 1}`);
      }
      if (names.has(entry.fullName)) {
        throw new Error(`${name} contains duplicate entry ${entry.fullName}`);
      }
      names.add(entry.fullName);
      if (category !== undefined && !entry.categories.includes(category)) {
        throw new Error(`${name} contains an entry outside category ${category}`);
      }
    });
  }

  function assertContinuousRanks(
    name: string,
    pageReferences: RankingPageReference[],
    expectedCount: number,
    pageSize: number,
    declaredPageCount: number,
    category?: PluginCategoryId
  ): RankedEntry[] {
    const expectedPageCount = Math.ceil(expectedCount / pageSize);
    if (declaredPageCount !== expectedPageCount || pageReferences.length !== expectedPageCount) {
      throw new Error(`${name} page count does not match manifest total`);
    }
    const entries = pageReferences.flatMap((reference, index) => {
      const relativePath = reference.url.slice(prefix.length);
      const payload = JSON.parse(byPath.get(relativePath) ?? "null") as RankingPageSnapshot;
      const expectedPage = index + 1;
      const expectedEntries = Math.min(pageSize, expectedCount - index * pageSize);
      if (
        reference.page !== expectedPage ||
        reference.count !== expectedEntries ||
        payload.page !== expectedPage ||
        payload.pageSize !== pageSize ||
        payload.pageCount !== expectedPageCount ||
        payload.total !== expectedCount ||
        payload.dataset !== (category === undefined ? "total" : "category") ||
        payload.category !== category
      ) {
        throw new Error(`${name} page metadata is inconsistent at page ${expectedPage}`);
      }
      return payload.rankings;
    });
    assertRankSequence(name, entries, expectedCount, category);
    return entries;
  }

  assertRankSequence("hot", entriesFor(manifest.datasets.hot), manifest.datasets.hot.count);
  assertRankSequence("rising", entriesFor(manifest.datasets.rising), manifest.datasets.rising.count);
  const validatedSkills = entriesFor(manifest.datasets.skills);
  assertRankSequence("skills", validatedSkills, manifest.datasets.skills.count);
  if (validatedSkills.some((entry) => entry.type !== "skill")) {
    throw new Error("Skills directory contains a non-Skill entry");
  }
  assertRankSequence("search", entriesFor(manifest.datasets.search), manifest.datasets.search.count);
  const validatedTotalEntries = assertContinuousRanks(
    "total",
    manifest.datasets.total.pages,
    manifest.datasets.total.count,
    manifest.datasets.total.pageSize,
    manifest.datasets.total.pageCount
  );
  if (
    manifest.datasets.total.skillCount !== undefined
    && validatedTotalEntries.filter((entry) => entry.type === "skill").length
      !== manifest.datasets.total.skillCount
  ) {
    throw new Error("total Skill count does not match manifest");
  }
  for (const category of manifest.categories) {
    const validatedCategoryEntries = assertContinuousRanks(
      category.id,
      category.pages,
      category.count,
      category.pageSize,
      category.pageCount,
      category.id
    );
    if (
      category.skillCount !== undefined
      && validatedCategoryEntries.filter((entry) => entry.type === "skill").length
        !== category.skillCount
    ) {
      throw new Error(`${category.id} Skill count does not match manifest`);
    }
  }
}

function snapshotDirectoryMatches(directory: string, files: RankingPublicationFile[]): boolean {
  return files.every(({ relativePath, content }) => {
    try {
      return readFileSync(join(directory, relativePath), "utf8") === content;
    } catch {
      return false;
    }
  });
}

function publishCompatibilityFiles(
  rankings: RankingsDocument,
  publicDirectory: string
): void {
  const documents: Array<[string, unknown, boolean?]> = [
    ["rankings.json", rankings],
    ["rankings-total.json", { ...rankings, rankings: rankings.rankings.total }],
    ["rankings-rising.json", { ...rankings, rankings: rankings.rankings.rising }],
    ["rankings-daily.json", { ...rankings, rankings: rankings.rankings.rising }],
    ["rankings-hot.json", { ...rankings, rankings: rankings.rankings.hot }],
    ["rankings-skills.json", {
      ...rankings,
      rankings: rankings.directories?.skills ?? [],
    }],
    ["rankings-search.json", buildSearchIndex(rankings), true],
  ];
  for (const [filename, value, compact] of documents) {
    atomicWrite(join(publicDirectory, filename), compact ? compactJson(value) : prettyJson(value));
  }
}

/**
 * Publish a complete immutable directory first, then atomically expose its manifest.
 * Existing compatibility endpoints remain available for the released DSH plugin.
 */
export function publishRankings(
  rankings: RankingsDocument,
  publicDirectory: string,
  options: RankingPublicationOptions = {}
): RankingManifestV2 {
  const publication = buildRankingPublication(rankings, options);
  const snapshotRoot = join(publicDirectory, "snapshots");
  const finalDirectory = join(snapshotRoot, publication.manifest.snapshotId);
  const stagingDirectory = join(
    snapshotRoot,
    `.${publication.manifest.snapshotId}.${process.pid}.${randomUUID()}.tmp`
  );
  mkdirSync(stagingDirectory, { recursive: true });

  try {
    for (const { relativePath, content } of publication.files) {
      const path = join(stagingDirectory, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
    }
    if (existsSync(finalDirectory)) {
      if (!snapshotDirectoryMatches(finalDirectory, publication.files)) {
        throw new Error(`Immutable ranking snapshot already exists with different data: ${finalDirectory}`);
      }
      rmSync(stagingDirectory, { recursive: true, force: true });
    } else {
      renameSync(stagingDirectory, finalDirectory);
    }

    publishCompatibilityFiles(rankings, publicDirectory);
    atomicWrite(join(publicDirectory, "manifest.json"), compactJson(publication.manifest));
    return publication.manifest;
  } catch (error) {
    rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}
