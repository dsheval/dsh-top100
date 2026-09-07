/** One authority and selector parser for repository metadata and persisted GitHub sources. */
export interface GitHubSource {
    repository: string;
    ref: string | null;
    path: string | null;
}
export declare function parseGitHubSource(value: unknown, purpose?: "install" | "repository"): GitHubSource | null;
export declare function githubRepositoryIdentity(value: unknown): string | null;
export declare function githubInstallTarget(source: GitHubSource): string;
