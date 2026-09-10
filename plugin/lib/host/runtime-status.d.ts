/** Read current Host root fibers; never activate plugins or inspect their providers. */
export type HostRuntimeState = "loaded" | "restart-required" | "missing-services" | "failed" | "inactive" | "unknown";
export type HostRuntimeReason = "root-active" | "profile-not-active" | "observer-unavailable" | "observation-failed" | "configuration-changed" | "entry-not-found" | "entry-unmapped" | "entry-ambiguous" | "root-failed" | "required-services-missing" | "root-not-active" | "disabled";
/** `loaded` means Host root activation only, not browser or functional verification. */
export interface HostRuntimeStatus {
    state: HostRuntimeState;
    reason: HostRuntimeReason;
    missingServices?: string[];
}
export interface RuntimeBundle {
    name: string;
    enabled: boolean;
    /** Declared inserted IDs, including groups; omit if the bundle layer is unreadable. */
    entryIds?: readonly string[];
    /** An existing install/update/toggle result can identify stale running instances. */
    requiresRestart?: boolean;
}
export interface RuntimeStatusInput {
    /** The caller must establish active Profile identity, including its directory. */
    isCurrentProfile: boolean;
    bundles: readonly RuntimeBundle[];
}
/** Structural optional SDK surface: no Loader package or injected service is required. */
export interface RuntimeStatusContext {
    get(name: string): unknown;
}
/**
 * Take one on-demand snapshot. No filesystem, polling, effects, tools or skills calls.
 * Known root errors remain visible; pending changes override a still-active old instance.
 */
export declare function readRuntimeStatus(ctx: RuntimeStatusContext | null | undefined, input: RuntimeStatusInput): Record<string, HostRuntimeStatus>;
