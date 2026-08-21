/** dsh-external organization discovery retained alongside the unified search pipeline. */

import { paginate, type GithubRepo } from "../github.js";

const ORG = "dsh-external";

/** 扫描 dsh-external 组织全部仓库 */
export async function scanOrg(): Promise<GithubRepo[]> {
  try {
    const repos = await paginate<GithubRepo>(`/orgs/${ORG}/repos?type=public`, 100, 5);
    console.log(`  org:${ORG} -> ${repos.length} repos`);
    return repos;
  } catch (err) {
    console.warn(`  org ${ORG} scan failed: ${(err as Error).message}`);
    return [];
  }
}
