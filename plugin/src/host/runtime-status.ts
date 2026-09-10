/** Read current Host root fibers; never activate plugins or inspect their providers. */

export type HostRuntimeState = "loaded" | "restart-required" | "missing-services" | "failed" | "inactive" | "unknown";
export type HostRuntimeReason = "root-active" | "profile-not-active" | "observer-unavailable" | "observation-failed"
  | "configuration-changed" | "entry-not-found" | "entry-unmapped" | "entry-ambiguous" | "root-failed"
  | "required-services-missing" | "root-not-active" | "disabled";

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
export interface RuntimeStatusContext { get(name: string): unknown }
interface RootFiber {
  state: number;
  inject?: Record<string, unknown>;
  ctx?: RuntimeStatusContext;
}
interface LoaderEntry {
  id: string;
  options: { id?: string; name?: string; group?: boolean; disabled?: unknown };
  fiber?: RootFiber;
}
interface LoaderReader { entries(): Iterable<LoaderEntry> }

function result(state: HostRuntimeState, reason: HostRuntimeReason): HostRuntimeStatus {
  return { state, reason };
}
function samePackage(moduleName: string | undefined, name: string): boolean {
  return moduleName === name || moduleName?.startsWith(`${name}/`) === true;
}

function bundleStatus(entries: readonly LoaderEntry[], bundle: RuntimeBundle): HostRuntimeStatus {
  const selected = new Set<LoaderEntry>();
  let absent = false;
  for (const id of new Set(bundle.entryIds ?? [])) {
    const matches = entries.filter((entry) => entry.id === id || entry.options.id === id);
    if (matches.length > 1) return result("unknown", "entry-ambiguous");
    if (matches.length === 0) absent = true;
    else selected.add(matches[0]);
  }
  // Also observes subpath entries, without matching similarly prefixed package names.
  for (const entry of entries) if (samePackage(entry.options.name, bundle.name)) selected.add(entry);
  const roots = [...selected].filter((entry) => !entry.options.group);
  if (!bundle.enabled) {
    if (bundle.requiresRestart || roots.some((entry) => entry.fiber && entry.fiber.state !== 4)) {
      return result("restart-required", "configuration-changed");
    }
    return roots.length || absent ? result("inactive", "disabled") : result("unknown", "entry-unmapped");
  }
  // Explicitly disabled rows can legitimately be optional members of an enabled bundle.
  const enabledRoots = roots.filter((entry) => entry.options.disabled !== true);
  if (enabledRoots.some((entry) => entry.fiber?.state === 3)) return result("failed", "root-failed");
  const missing = new Set<string>();
  for (const entry of enabledRoots) {
    const fiber = entry.fiber;
    if (fiber?.state !== 0 || !fiber.ctx) continue;
    // Fiber.inject contains required root services. Nested ctx.inject() fibers are not traversed.
    for (const name of Object.keys(fiber.inject ?? {})) {
      if (/^[A-Za-z_$][\w:./@-]{0,127}$/.test(name) && fiber.ctx.get(name) === undefined) missing.add(name);
    }
  }
  if (missing.size) return { state: "missing-services", reason: "required-services-missing", missingServices: [...missing].sort() };
  if (bundle.requiresRestart) return result("restart-required", "configuration-changed");
  if (absent) return result("unknown", "entry-not-found");
  if (!enabledRoots.length) return result("unknown", "entry-unmapped");
  if (enabledRoots.every((entry) => entry.fiber?.state === 2)) return result("loaded", "root-active");
  // No private _error reads, service checks, disabled-expression evaluation, or lifecycle awaits.
  return result("unknown", "root-not-active");
}

/**
 * Take one on-demand snapshot. No filesystem, polling, effects, tools or skills calls.
 * Known root errors remain visible; pending changes override a still-active old instance.
 */
export function readRuntimeStatus(
  ctx: RuntimeStatusContext | null | undefined,
  input: RuntimeStatusInput,
): Record<string, HostRuntimeStatus> {
  const all = (reason: HostRuntimeReason) => Object.fromEntries(input.bundles.map((bundle) => [bundle.name,
    bundle.requiresRestart && reason !== "profile-not-active"
      ? result("restart-required", "configuration-changed") : result("unknown", reason)]));
  if (!input.isCurrentProfile) return all("profile-not-active");
  let entries: LoaderEntry[];
  try {
    const loader = ctx?.get("loader") as Partial<LoaderReader> | null | undefined;
    if (typeof loader?.entries !== "function") return all("observer-unavailable");
    entries = [...loader.entries()];
  } catch {
    return all("observation-failed");
  }
  return Object.fromEntries(input.bundles.map((bundle) => {
    try { return [bundle.name, bundleStatus(entries, bundle)]; }
    catch { return [bundle.name, result("unknown", "observation-failed")]; }
  }));
}
