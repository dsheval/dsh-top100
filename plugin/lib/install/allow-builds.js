/** Persist explicitly verified pnpm build-script permissions. */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { profileDir } from "../host/profile.js";
const PACKAGE_KEY_RE = /^[A-Za-z0-9@/_.-]+$/;
const GIT_KEY_RE = /^[A-Za-z0-9@/_.-]+@git\+https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/;
const CODELOAD_KEY_RE = /^[A-Za-z0-9@/_.-]+@https:\/\/codeload\.github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/tar\.gz\/[0-9a-f]{40}$/;
function validKey(key) {
    return PACKAGE_KEY_RE.test(key) || GIT_KEY_RE.test(key) || CODELOAD_KEY_RE.test(key);
}
function quoteYamlKey(key) {
    return /^[-?:,[\]{}#&*!|>'"%@`]/.test(key) || /:(\s|$)/.test(key)
        ? `'${key.replace(/'/g, "''")}'`
        : key;
}
/** Merge approvals into the profile's allowBuilds map and repair duplicate blocks. */
export function allowPackageBuild(profile, packageKeys, explicitDir) {
    const requested = typeof packageKeys === "string" ? [packageKeys] : packageKeys;
    for (const key of requested) {
        if (!validKey(key))
            throw new Error(`无效的构建许可键：${key}`);
    }
    const path = join(profileDir(profile, explicitDir), "pnpm-workspace.yaml");
    let source = "";
    try {
        source = readFileSync(path, "utf8");
    }
    catch { /* create below */ }
    const blockRe = /allowBuilds:[ \t]*\r?\n((?:[ \t]+[^\r\n]*\r?\n?)*)/g;
    const approvals = new Map();
    const matches = [...source.matchAll(blockRe)];
    for (const match of matches) {
        for (const line of match[1].split(/\r?\n/)) {
            const entry = /^[ \t]+(\S.*?)\s*:\s*(true|false)?\s*$/.exec(line);
            if (!entry?.[1])
                continue;
            let key = entry[1];
            if (key.length >= 2 && ((key.startsWith("'") && key.endsWith("'")) || (key.startsWith('"') && key.endsWith('"')))) {
                key = key.slice(1, -1);
            }
            if (validKey(key))
                approvals.set(key, entry[2] === "false" ? "false" : "true");
        }
    }
    for (const key of requested)
        approvals.set(key, "true");
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const rows = [...approvals].map(([key, value]) => `  ${quoteYamlKey(key)}: ${value}`).join(eol);
    const block = `allowBuilds:${eol}${rows}${eol}`;
    let next;
    if (matches.length === 0) {
        next = `${source.replace(/\r?\n?$/, eol)}${block}`;
    }
    else {
        let seen = 0;
        next = source.replace(blockRe, () => (seen++ === 0 ? block : ""));
    }
    if (next === source)
        return false;
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temporary, next, "utf8");
    renameSync(temporary, path);
    return true;
}
