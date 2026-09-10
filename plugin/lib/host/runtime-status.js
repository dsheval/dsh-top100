/** Read current Host root fibers; never activate plugins or inspect their providers. */
function result(state, reason) {
    return { state, reason };
}
function samePackage(moduleName, name) {
    return moduleName === name || moduleName?.startsWith(`${name}/`) === true;
}
function bundleStatus(entries, bundle) {
    const selected = new Set();
    let absent = false;
    for (const id of new Set(bundle.entryIds ?? [])) {
        const matches = entries.filter((entry) => entry.id === id || entry.options.id === id);
        if (matches.length > 1)
            return result("unknown", "entry-ambiguous");
        if (matches.length === 0)
            absent = true;
        else
            selected.add(matches[0]);
    }
    // Also observes subpath entries, without matching similarly prefixed package names.
    for (const entry of entries)
        if (samePackage(entry.options.name, bundle.name))
            selected.add(entry);
    const roots = [...selected].filter((entry) => !entry.options.group);
    if (!bundle.enabled) {
        if (bundle.requiresRestart || roots.some((entry) => entry.fiber && entry.fiber.state !== 4)) {
            return result("restart-required", "configuration-changed");
        }
        return roots.length || absent ? result("inactive", "disabled") : result("unknown", "entry-unmapped");
    }
    // Explicitly disabled rows can legitimately be optional members of an enabled bundle.
    const enabledRoots = roots.filter((entry) => entry.options.disabled !== true);
    if (enabledRoots.some((entry) => entry.fiber?.state === 3))
        return result("failed", "root-failed");
    const missing = new Set();
    for (const entry of enabledRoots) {
        const fiber = entry.fiber;
        if (fiber?.state !== 0 || !fiber.ctx)
            continue;
        // Fiber.inject contains required root services. Nested ctx.inject() fibers are not traversed.
        for (const name of Object.keys(fiber.inject ?? {})) {
            if (/^[A-Za-z_$][\w:./@-]{0,127}$/.test(name) && fiber.ctx.get(name) === undefined)
                missing.add(name);
        }
    }
    if (missing.size)
        return { state: "missing-services", reason: "required-services-missing", missingServices: [...missing].sort() };
    if (bundle.requiresRestart)
        return result("restart-required", "configuration-changed");
    if (absent)
        return result("unknown", "entry-not-found");
    if (!enabledRoots.length)
        return result("unknown", "entry-unmapped");
    if (enabledRoots.every((entry) => entry.fiber?.state === 2))
        return result("loaded", "root-active");
    // No private _error reads, service checks, disabled-expression evaluation, or lifecycle awaits.
    return result("unknown", "root-not-active");
}
/**
 * Take one on-demand snapshot. No filesystem, polling, effects, tools or skills calls.
 * Known root errors remain visible; pending changes override a still-active old instance.
 */
export function readRuntimeStatus(ctx, input) {
    const all = (reason) => Object.fromEntries(input.bundles.map((bundle) => [bundle.name,
        bundle.requiresRestart && reason !== "profile-not-active"
            ? result("restart-required", "configuration-changed") : result("unknown", reason)]));
    if (!input.isCurrentProfile)
        return all("profile-not-active");
    let entries;
    try {
        const loader = ctx?.get("loader");
        if (typeof loader?.entries !== "function")
            return all("observer-unavailable");
        entries = [...loader.entries()];
    }
    catch {
        return all("observation-failed");
    }
    return Object.fromEntries(input.bundles.map((bundle) => {
        try {
            return [bundle.name, bundleStatus(entries, bundle)];
        }
        catch {
            return [bundle.name, result("unknown", "observation-failed")];
        }
    }));
}
