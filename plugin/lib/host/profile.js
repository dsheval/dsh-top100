/** Read the current DSH profile's installed packages. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const INBOX_BUNDLES = new Set([
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "@deepseek-ai/dsh-headless",
]);
export function profileDir(profile, explicitDir) {
    if (explicitDir !== undefined)
        return explicitDir;
    const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
    return join(home, "profiles", profile);
}
export function readInstalled(profile, explicitDir) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile, explicitDir), "package.json"), "utf8"));
        const installed = {};
        for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
            if (!INBOX_BUNDLES.has(name))
                installed[name] = spec;
        }
        return installed;
    }
    catch {
        return {};
    }
}
export function argvProfile() {
    const argv = process.argv;
    const flag = argv.indexOf("--profile");
    if (flag !== -1 && flag + 1 < argv.length && !argv[flag + 1].startsWith("-")) {
        return argv[flag + 1];
    }
    return undefined;
}
