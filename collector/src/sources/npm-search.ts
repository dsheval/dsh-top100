/** npm registry discovery for packages that link back to GitHub DSH repositories. */

export interface NpmSearchPackage {
  name: string;
  links?: { repository?: string };
}

interface NpmSearchResponse {
  total: number;
  objects: Array<{ package: NpmSearchPackage }>;
}

export interface NpmSearchOptions {
  pageSize?: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}

export interface NpmSearchResult {
  repositories: string[];
  packages: number;
  requests: number;
  complete: boolean;
}

/** Normalize common npm repository link formats into owner/repo. */
export function githubRepositoryFromNpmLink(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^git\+/, "");
  const match = normalized.match(
    /(?:github\.com[/:]|^github:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[#/?].*)?$/i
  );
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

/** Search npm and extract unique GitHub source repositories. */
export async function searchNpmRepositories(
  query: string,
  options: NpmSearchOptions = {}
): Promise<NpmSearchResult> {
  const pageSize = options.pageSize ?? 250;
  const maxPages = options.maxPages ?? 20;
  const fetchImpl = options.fetchImpl ?? fetch;
  const repositories = new Map<string, string>();
  let requests = 0;
  let packages = 0;
  let total = 0;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      text: query,
      size: String(pageSize),
      from: String(page * pageSize),
    });
    requests++;
    const response = await fetchImpl(`https://registry.npmjs.org/-/v1/search?${params}`, {
      headers: { "User-Agent": "dsh-market-collector" },
    });
    if (!response.ok) throw new Error(`npm search returned ${response.status}`);
    const body = (await response.json()) as NpmSearchResponse;
    total = body.total;
    packages += body.objects.length;
    for (const item of body.objects) {
      const fullName = githubRepositoryFromNpmLink(item.package.links?.repository);
      if (fullName && !repositories.has(fullName.toLowerCase())) {
        repositories.set(fullName.toLowerCase(), fullName);
      }
    }
    if (packages >= total || body.objects.length < pageSize) break;
  }

  return {
    repositories: [...repositories.values()],
    packages,
    requests,
    complete: packages >= total,
  };
}
