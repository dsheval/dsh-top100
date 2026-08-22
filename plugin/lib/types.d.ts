/** Shared shapes for the published rankings JSON and the plugin HTTP API. */
export interface RankingInstall {
    method?: string;
    target?: string;
    needsConfig?: boolean;
    commands?: string[];
    commandSource?: string;
}
export interface RankingEntry {
    rank: number;
    totalRank?: number;
    fullName: string;
    name: string;
    owner: string;
    description: string;
    descriptionZh: string;
    stars: number;
    dailyStars: number;
    weeklyStars: number;
    hotScore: number;
    forks: number;
    openIssues: number;
    language: string | null;
    homepage: string | null;
    license: string | null;
    topics: string[];
    tags: string[];
    type: string;
    install?: RankingInstall;
    sources: string[];
    url: string;
    pushedAt: string;
    createdAt: string;
    updatedAt: string;
}
export interface RankingsDocument {
    schemaVersion: number;
    generatedAt: string;
    snapshotDate: string;
    definitions?: {
        total?: string;
        rising?: string;
        hot?: string;
    };
    rankings: {
        total: RankingEntry[];
        rising: RankingEntry[];
        hot: RankingEntry[];
    };
}
export type RankingView = "hot" | "rising" | "total";
export interface InstallSpec {
    kind: "npm" | "github";
    spec: string;
}
export interface CatalogItem extends RankingEntry {
    installable: boolean;
    installSpec: InstallSpec | null;
    installed: boolean;
}
export interface CatalogResponse {
    view: RankingView;
    generatedAt: string;
    snapshotDate: string;
    dataUrl: string;
    query: string;
    total: number;
    offset: number;
    limit: number;
    items: CatalogItem[];
}
export interface InstalledMap {
    [name: string]: string;
}
export interface ProgressSnapshot {
    active: boolean;
    fullName: string | null;
    spec: string | null;
    lastLine: string;
    startedAt: number | null;
    error: string | null;
}
export type InstallPhase = "queued" | "validating" | "downloading" | "waiting-profile-lock" | "installing" | "installed" | "failed" | "cancelled";
export interface InstallJobSnapshot {
    id: string;
    batchId: string;
    fullName: string;
    profile: string;
    phase: InstallPhase;
    lastLine: string;
    error: string | null;
    message: string | null;
    requiresRestart: boolean;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    cancelRequested: boolean;
}
export interface InstallBatchSnapshot {
    batchId: string;
    createdAt: number;
    jobs: InstallJobSnapshot[];
    completed: number;
    total: number;
    requiresRestart: boolean;
}
export interface InstallResult {
    exitCode: number | null;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    cancelled: boolean;
}
