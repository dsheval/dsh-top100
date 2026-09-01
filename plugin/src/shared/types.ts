/** Shared shapes for the published rankings JSON and the plugin HTTP API. */

export interface RankingInstall {
  method?: string;
  target?: string;
  needsConfig?: boolean;
  commands?: string[];
  commandSource?: string;
}

export type PluginCategoryId = "ai" | "appearance" | "coding" | "knowledge" | "tools" | "security";

export interface PluginCategoryAssignment {
  id: PluginCategoryId;
  confidence: number;
  evidence: string;
  source: "deepseek" | "rule-fallback" | "manual";
  model?: string;
  classifiedAt?: string;
}

export interface PluginCategoryDefinition {
  id: PluginCategoryId;
  label: string;
  description: string;
  count: number;
}

export interface CatalogCategoryDefinition extends PluginCategoryDefinition {
  /** Skill entries removed by the active catalog scope. */
  excludedSkillCount: number;
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
  categories?: Array<PluginCategoryAssignment | PluginCategoryId>;
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
  categories?: PluginCategoryDefinition[];
  rankings: {
    total: RankingEntry[];
    rising: RankingEntry[];
    hot: RankingEntry[];
  };
}

export type RankingView = "hot" | "rising" | "total" | "category";

export interface InstallSpec {
  kind: "npm" | "github";
  spec: string;
}

export type CatalogFormFactor =
  | "dsh-bundle"
  | "dsh-skill"
  | "agent-skill"
  | "theme"
  | "mcp-integration"
  | "desktop-app"
  | "ecosystem-project"
  | "candidate";

export type CatalogTrustLevel = "indexed" | "structured" | "install-source";

export type CatalogEvidenceSignalCode =
  | "indexed"
  | "dsh-skill"
  | "agent-skill"
  | "theme-bundle"
  | "dsh-bundle"
  | "install-source";

export interface CatalogEvidence {
  formFactor: CatalogFormFactor;
  compatible: boolean;
  trustLevel: CatalogTrustLevel;
  signalCodes: CatalogEvidenceSignalCode[];
  caveatCode: "not-security-review";
  /** Human-readable fallback retained for non-UI consumers and older clients. */
  signals: string[];
  /** Human-readable fallback retained for non-UI consumers and older clients. */
  caveat: string;
}

export interface CatalogItem extends RankingEntry {
  installable: boolean;
  installSpec: InstallSpec | null;
  installed: boolean;
  evidence: CatalogEvidence;
}

export interface CatalogCacheStatus {
  fetchedAt: number | null;
  ageMs: number | null;
  stale: boolean;
  reason: string | null;
  source: "network-or-cache" | "unknown";
  dataset: "view-shard" | "search-index" | "full-catalog";
}

export interface CatalogResponse {
  view: RankingView;
  category: PluginCategoryId | null;
  categories: CatalogCategoryDefinition[];
  generatedAt: string;
  snapshotDate: string;
  dataUrl: string;
  query: string;
  excludeSkills: boolean;
  compatibleOnly: boolean;
  cache: CatalogCacheStatus;
  total: number;
  excludedSkillCount: number;
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

export type InstallPhase =
  | "queued"
  | "validating"
  | "downloading"
  | "waiting-profile-lock"
  | "installing"
  | "installed"
  | "failed"
  | "cancelled";

export type ActivationState =
  | "pending"
  | "not-applicable"
  | "configuration-valid"
  | "restart-required"
  | "live"
  | "inert"
  | "broken"
  | "unknown";

export interface LifecycleScriptEvidence {
  name: "preinstall" | "install" | "postinstall" | "prepare";
  command: string;
}

export interface InstallProvenance {
  source: "npm" | "github";
  requestedTarget: string;
  resolvedTarget: string;
  packageName: string | null;
  version: string | null;
  commit: string | null;
  integrity: string | null;
  repositoryUrl: string | null;
  repositoryIdentity: "matched" | "unavailable" | "not-applicable";
  verifiedAt: number;
}

export interface InstallRiskEvidence {
  code: "lifecycle-scripts" | "repository-identity" | "skill-content" | "restart-required";
  severity: "info" | "warning";
  summary: string;
  detail: string;
}

export interface InstallPreflight {
  approvalToken: string;
  expiresAt: number;
  fullName: string;
  profile: string;
  kind: "bundle" | "skill";
  provenance: InstallProvenance;
  lifecycleScripts: LifecycleScriptEvidence[];
  risks: InstallRiskEvidence[];
  requiresExplicitApproval: boolean;
  activationExpectation: ActivationState;
}

export interface InstallJobSnapshot {
  id: string;
  batchId: string;
  fullName: string;
  profile: string;
  action?: InstallAction;
  kind?: ManagedKind;
  phase: InstallPhase;
  lastLine: string;
  error: string | null;
  message: string | null;
  requiresRestart: boolean;
  activationState: ActivationState;
  provenance: InstallProvenance | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  cancelRequested: boolean;
}

export type InstallAction = "install" | "update" | "uninstall";

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

export type ManagedKind = "bundle" | "skill";

export interface ManagedPlugin {
  name: string;
  spec: string;
  version: string | null;
  description: string;
  descriptionZh: string;
  fullName: string | null;
  url: string | null;
  enabled: boolean;
  updateAvailable: boolean;
  latest: string | null;
  local: boolean;
  protected: boolean;
  kind: ManagedKind;
  activationState: ActivationState;
}

export interface ManagedListResponse {
  profile: string;
  query: string;
  total: number;
  items: ManagedPlugin[];
}

export const DIAGNOSTIC_SCHEMA = "dsh-top100/diagnostics/v1";
export type DiagnosticSeverity = "error" | "warning" | "info";

export interface DiagnosticFinding {
  severity: DiagnosticSeverity;
  code: string;
  subject: string;
  message: string;
  detail?: string;
}

export interface DiagnosticBundle {
  name: string;
  spec: string;
  version: string | null;
  kind: "official" | "community";
  directory: string | null;
  patchPath: string | null;
  entries: string[];
  error: string | null;
  enabled: boolean;
  local: boolean;
  protected: boolean;
  catalogName: string | null;
  latest: string | null;
  updateAvailable: boolean;
}

export interface DiagnosticSkill { name: string; hasManifest: boolean; description: string }
export interface DiagnosticPeer { plugin: string; name: string; range: string; resolved: string | null; satisfied: boolean | null }
export interface DiagnosticDuplicate { id: string; layers: string[]; count: number }
export interface DiagnosticMultiVersion { name: string; versions: string[] }
export interface DiagnosticHostDep { plugin: string; dependency: string; range: string }

export interface DiagnosticCatalog {
  dataUrl: string;
  ok: boolean;
  error: string | null;
  snapshotDate: string | null;
  generatedAt: string | null;
  fetchedAt: number | null;
  latencyMs: number | null;
  counts: { hot: number; rising: number; total: number };
  staleDays: number | null;
}

export interface DiagnosticInventory {
  official: number;
  community: number;
  skills: number;
  enabled: number;
  disabled: number;
  protected: number;
  local: number;
  updates: number;
  catalogMatched: number;
  missingOnDisk: number;
  extraDependencies: string[];
}

export interface DiagnosticPatch {
  path: string;
  exists: boolean;
  disables: string[];
  forced: string[];
  orphans: string[];
}

export interface DiagnosticReport {
  schema: typeof DIAGNOSTIC_SCHEMA;
  profile: string;
  profileDir: string;
  scannedAt: number;
  pluginVersion: string;
  summary: {
    ok: boolean;
    errors: number;
    warnings: number;
    infos: number;
    conflicts: number;
    dependencies: number;
    catalogIssues: number;
    order: number;
  };
  catalog: DiagnosticCatalog;
  inventory: DiagnosticInventory;
  bundles: DiagnosticBundle[];
  skills: DiagnosticSkill[];
  duplicates: DiagnosticDuplicate[];
  peers: DiagnosticPeer[];
  multiVersion: DiagnosticMultiVersion[];
  hostDeps: DiagnosticHostDep[];
  patch: DiagnosticPatch;
  findings: DiagnosticFinding[];
}
