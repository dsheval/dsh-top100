/** Derive a safe `dsh plugin add` target from a ranking entry. Never execute README commands. */
import { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE, normalizeInstallTarget, resolveCatalogInstallTarget } from "../shared/install-source.js";
export { NPM_SPEC_RE, GITHUB_SPEC_RE, FULL_NAME_RE };
// Only generated, commit-pinned sources may use &path:. Raw README targets cannot.
export const SAFE_TARGET_RE = /^[A-Za-z0-9@:./_#&+-]+$/;
export function isCordisEntry(entry) {
    const type = entry.type?.toLowerCase() ?? "";
    const method = entry.install?.method?.toLowerCase() ?? "";
    return type === "cordis-plugin" || type === "cordis" || method === "pnpm-profile";
}
export function parseInstallSpec(raw) {
    const token = normalizeInstallTarget(raw);
    if (!token)
        return null;
    const github = token.match(GITHUB_SPEC_RE);
    if (github) {
        return { kind: "github", spec: `github:${github[1]}/${github[2]}${github[3] ? `#${github[3]}` : ""}` };
    }
    if (NPM_SPEC_RE.test(token) && !token.startsWith(".") && !token.includes("\\")) {
        return { kind: "npm", spec: token };
    }
    return null;
}
export function npmPackageSpec(spec) {
    const match = spec.match(NPM_SPEC_RE);
    if (!match)
        return null;
    return { name: match[1], selector: match[2] ?? null };
}
export function resolveInstallSpec(entry) {
    const target = resolveCatalogInstallTarget(entry);
    return target ? parseInstallSpec(target) : null;
}
export function isInstalledEntry(entry, installed) {
    const spec = resolveInstallSpec(entry);
    const fullName = entry.fullName.toLowerCase();
    const repo = entry.name.toLowerCase();
    for (const [name, value] of Object.entries(installed)) {
        if (name.toLowerCase() === repo)
            return true;
        const packageName = spec?.kind === "npm" ? npmPackageSpec(spec.spec)?.name.toLowerCase() : null;
        if (packageName && name.toLowerCase() === packageName)
            return true;
        const source = value.toLowerCase().replace(/^git\+/, "");
        if (source === `github:${fullName}` || source.startsWith(`github:${fullName}#`))
            return true;
        if (source.startsWith(`https://github.com/${fullName}.git`)
            || source.startsWith(`https://github.com/${fullName}#`)
            || source === `https://github.com/${fullName}`
            || source.startsWith(`git://github.com/${fullName}.git`))
            return true;
    }
    return false;
}
