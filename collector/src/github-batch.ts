/** Batch refresh existing repositories through GitHub GraphQL aliases. */

import { githubFetch } from "./github.js";

export interface RepositoryRefresh {
  requestedFullName: string;
  fullName: string;
  stars: number;
  starsObservedAt: string;
  forks: number;
  openIssues: number;
  pushedAt: string;
  updatedAt: string;
  archived: boolean;
  fork: boolean;
  private?: boolean;
}

interface GraphqlRepository {
  nameWithOwner: string;
  stargazerCount: number;
  forkCount: number;
  issues: { totalCount: number };
  pushedAt: string | null;
  updatedAt: string;
  isArchived: boolean;
  isFork: boolean;
  isPrivate?: boolean;
}

interface GraphqlResponse {
  data?: Record<string, GraphqlRepository | null>;
  errors?: Array<{ message: string; path?: Array<string | number> }>;
}

export interface BatchRefreshOptions {
  batchSize?: number;
  request?: (query: string) => Promise<GraphqlResponse>;
  onProgress?: (completed: number, total: number) => void;
}

async function requestGraphql(query: string): Promise<GraphqlResponse> {
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required for GraphQL refresh");
  return githubFetch<GraphqlResponse>("/graphql", {
    method: "POST",
    body: { query },
  });
}

function repositoryField(alias: string, fullName: string): string {
  const separator = fullName.indexOf("/");
  if (separator <= 0 || separator === fullName.length - 1) {
    throw new Error(`Invalid GitHub repository name: ${fullName}`);
  }
  const owner = fullName.slice(0, separator);
  const name = fullName.slice(separator + 1);
  return `${alias}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
    nameWithOwner
    stargazerCount
    forkCount
    issues(states: OPEN, first: 1) { totalCount }
    pushedAt
    updatedAt
    isArchived
    isFork
    isPrivate
  }`;
}

/** Refresh repositories in bounded GraphQL batches while retaining per-name failures. */
export async function fetchRepositoryUpdates(
  fullNames: string[],
  options: BatchRefreshOptions = {}
): Promise<Map<string, RepositoryRefresh>> {
  const batchSize = options.batchSize ?? 25;
  if (!Number.isInteger(batchSize) || batchSize <= 0 || batchSize > 50) {
    throw new Error("GraphQL repository batch size must be between 1 and 50");
  }
  const request = options.request ?? requestGraphql;
  const updates = new Map<string, RepositoryRefresh>();

  for (let offset = 0; offset < fullNames.length; offset += batchSize) {
    const batch = fullNames.slice(offset, offset + batchSize);
    const aliases = batch.map((fullName, index) => ({
      alias: `repository${index}`,
      fullName,
    }));
    const query = `query RepositoryRefresh {\n${aliases
      .map(({ alias, fullName }) => repositoryField(alias, fullName))
      .join("\n")}\n}`;
    const response = await request(query);
    const observedAt = new Date().toISOString();
    for (const { alias, fullName } of aliases) {
      const repository = response.data?.[alias];
      if (!repository) continue;
      const incomplete = !Number.isSafeInteger(repository.stargazerCount) || repository.stargazerCount < 0
        || response.errors?.some(error => !error.path?.length || error.path[0] === alias);
      // Definitive exclusion signals must survive a partial metrics response.
      if (incomplete && !repository.isPrivate && !repository.isArchived && !repository.isFork) continue;
      updates.set(fullName.toLowerCase(), {
        requestedFullName: fullName,
        fullName: repository.nameWithOwner,
        stars: Number.isSafeInteger(repository.stargazerCount) ? repository.stargazerCount : 0,
        starsObservedAt: incomplete ? "" : observedAt,
        forks: repository.forkCount,
        openIssues: repository.issues?.totalCount ?? 0,
        pushedAt: repository.pushedAt ?? repository.updatedAt,
        updatedAt: repository.updatedAt,
        archived: repository.isArchived,
        fork: repository.isFork,
        private: repository.isPrivate,
      });
    }
    options.onProgress?.(Math.min(offset + batch.length, fullNames.length), fullNames.length);
  }
  return updates;
}
