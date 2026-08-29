/** Persist enable/disable through the profile user patch layer. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JSON_SCHEMA, Type, load } from "js-yaml";
import { INBOX_BUNDLES, profileDir } from "./profile.js";
const ROW_ID_RE = /^[A-Za-z0-9_.-]+$/;
const SELF_PACKAGES = new Set([
    "dsh-top100",
    "dsh-top100-plugin",
    "@dsheval/dsh-top100-plugin",
]);
export function userPatchPath(profile, explicitDir) {
    return join(profileDir(profile, explicitDir), "cordis.patch.yml");
}
const jsExpr = new Type("tag:yaml.org,2002:js", {
    kind: "scalar",
    resolve: (data) => typeof data === "string",
    construct: (data) => ({ __jsExpr: String(data) }),
});
const entrySchema = JSON_SCHEMA.extend(jsExpr);
/** Parse the same entry-list YAML dialect DSH uses, including `!!js` scalars. */
export function parseDshPatchText(source) {
    try {
        const value = load(source, { schema: entrySchema });
        return Array.isArray(value) ? value : null;
    }
    catch {
        return null;
    }
}
/**
 * Find user-owned `insert` rows that still load a package. `null` is a
 * fail-closed result: the patch uses a shape this small DSH-dialect reader
 * cannot inspect safely, so uninstall must not guess.
 */
export function userPatchPackageReferences(patchPath, packageName) {
    let source;
    try {
        source = readFileSync(patchPath, "utf8");
    }
    catch (error) {
        const code = error !== null && typeof error === "object" && "code" in error
            ? error.code
            : undefined;
        return code === "ENOENT" ? [] : null;
    }
    const rows = parseDshPatchText(source);
    if (rows === null)
        return null;
    const insertedNames = new Set();
    const visiting = new Set();
    const visited = new Set();
    const collect = (entries) => {
        if (visited.has(entries))
            return true;
        if (visiting.has(entries))
            return false;
        visiting.add(entries);
        for (const entry of entries) {
            if (entry === null || typeof entry !== "object" || Array.isArray(entry))
                return false;
            const row = entry;
            if ("name" in row && typeof row.name !== "string")
                return false;
            if (typeof row.name === "string")
                insertedNames.add(row.name);
            if (row.group === true && Array.isArray(row.config) && !collect(row.config))
                return false;
        }
        visiting.delete(entries);
        visited.add(entries);
        return true;
    };
    for (const patch of rows) {
        if (patch === null || typeof patch !== "object" || Array.isArray(patch))
            return null;
        const row = patch;
        if (!("insert" in row))
            continue;
        if (!Array.isArray(row.insert) || !collect(row.insert))
            return null;
    }
    return [...insertedNames].filter((reference) => reference === packageName || reference.startsWith(`${packageName}/`));
}
export function isProtectedPackage(name) {
    return INBOX_BUNDLES.has(name) || SELF_PACKAGES.has(name) || name.startsWith("@deepseek-ai/");
}
export function readUserPatchState(patchPath) {
    const disables = [];
    const forced = [];
    let text = "";
    try {
        text = readFileSync(patchPath, "utf8");
    }
    catch {
        return { disables, forced };
    }
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const row = /^- id: ['"]?([A-Za-z0-9_.-]+)['"]?\s*$/.exec(lines[index] ?? "");
        if (row === null)
            continue;
        const next = lines[index + 1] ?? "";
        if (/^ {2}disabled: true\s*$/.test(next))
            disables.push(row[1]);
        else if (/^ {2}disabled: false\s*$/.test(next))
            forced.push(row[1]);
    }
    return { disables, forced };
}
export function parseInsertedIds(text) {
    const ids = [];
    let insertIndent = null;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, "");
        if (line.trim() === "")
            continue;
        const indent = line.length - line.trimStart().length;
        if (insertIndent !== null && indent <= insertIndent && !/^\s*-?\s*(id|name|config):/.test(line))
            insertIndent = null;
        if (/^\s*-?\s*insert:\s*$/.test(line)) {
            insertIndent = indent;
            continue;
        }
        const id = /^\s*-?\s*id:\s*['"]?([^'"\s]+)/.exec(line);
        if (id !== null && insertIndent !== null && indent > insertIndent && !ids.includes(id[1]))
            ids.push(id[1]);
    }
    return ids;
}
export function rowIdsForPackage(profile, packageName, explicitDir) {
    const ids = new Set();
    const packageDir = join(profileDir(profile, explicitDir), "node_modules", packageName);
    const candidates = ["cordis.patch.yml"];
    try {
        const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
        if (typeof manifest.dsh?.bundle?.patch === "string")
            candidates.unshift(manifest.dsh.bundle.patch);
    }
    catch { /* package missing */ }
    for (const relative of candidates) {
        try {
            for (const id of parseInsertedIds(readFileSync(join(packageDir, relative), "utf8")))
                ids.add(id);
        }
        catch { /* no patch */ }
    }
    if (ids.size === 0) {
        const fallback = packageName.replace(/^@[^/]+\//, "").replace(/^@/, "");
        if (ROW_ID_RE.test(fallback))
            ids.add(fallback);
    }
    return [...ids].filter((id) => ROW_ID_RE.test(id));
}
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function rowBlock(rowId, disabled) { return `- id: ${rowId}\n  disabled: ${disabled ? "true" : "false"}\n`; }
function withPlaceholderRestored(text) {
    if (text.replace(/^[ \t]*#.*$/gm, "").trim() !== "")
        return text;
    const uncommented = text.replace(/^[ \t]*#[ \t]*\[[ \t]*\][ \t]*(?:\r?\n|$)/m, "[]\n");
    if (uncommented !== text)
        return uncommented;
    return text === "" || text.endsWith("\n") ? `${text}[]\n` : `${text}\n[]\n`;
}
function appendPatchEntry(patchPath, block) {
    let text = "";
    try {
        text = readFileSync(patchPath, "utf8");
    }
    catch {
        writeFileSync(patchPath, block);
        return { ok: true, reason: null };
    }
    const withoutComments = text.replace(/^[ \t]*#.*$/gm, "").trim();
    if (withoutComments === "") {
        writeFileSync(patchPath, `${text.endsWith("\n") ? text : `${text}\n`}${block}`);
        return { ok: true, reason: null };
    }
    if (withoutComments === "[]" || withoutComments === "[ ]") {
        const commented = text.replace(/^[ \t]*\[[ \t]*\][ \t]*(?:#.*)?(?:\r?\n|$)/m, "# []\n");
        writeFileSync(patchPath, `${commented.endsWith("\n") ? commented : `${commented}\n`}${block}`);
        return { ok: true, reason: null };
    }
    const last = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")).pop() ?? "";
    if (/^[\[{]/.test(last))
        return { ok: false, reason: "补丁层以顶层流式结构结尾，已拒绝写入" };
    writeFileSync(patchPath, `${text.endsWith("\n") ? text : `${text}\n`}${block}`);
    return { ok: true, reason: null };
}
export function setRowDisabled(patchPath, rowId, disabled) {
    if (!ROW_ID_RE.test(rowId))
        return { ok: false, reason: `无效的补丁行 id：${rowId}` };
    const state = readUserPatchState(patchPath);
    if (disabled && state.disables.includes(rowId))
        return { ok: true, reason: null };
    if (!disabled && state.forced.includes(rowId) && !state.disables.includes(rowId))
        return { ok: true, reason: null };
    const text = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
    const disableRe = new RegExp(`^- id: ['"]?${escapeRegExp(rowId)}['"]?\\r?\\n  disabled: true\\r?\\n`, "m");
    const forceRe = new RegExp(`^- id: ['"]?${escapeRegExp(rowId)}['"]?\\r?\\n  disabled: false\\r?\\n`, "m");
    if (disabled) {
        if (forceRe.test(text)) {
            writeFileSync(patchPath, text.replace(forceRe, rowBlock(rowId, true)));
            return { ok: true, reason: null };
        }
        return appendPatchEntry(patchPath, rowBlock(rowId, true));
    }
    if (disableRe.test(text)) {
        writeFileSync(patchPath, withPlaceholderRestored(text.replace(disableRe, "")));
        return { ok: true, reason: null };
    }
    return appendPatchEntry(patchPath, rowBlock(rowId, false));
}
export function removeRowBlocks(patchPath, rowIds) {
    if (!existsSync(patchPath) || rowIds.length === 0)
        return;
    let text = readFileSync(patchPath, "utf8");
    const original = text;
    for (const rowId of rowIds) {
        const blockRe = new RegExp(`^- id: ['"]?${escapeRegExp(rowId)}['"]?\\r?\\n  disabled: (?:true|false)\\r?\\n`, "m");
        text = text.replace(blockRe, "");
    }
    if (text !== original)
        writeFileSync(patchPath, withPlaceholderRestored(text));
}
export function packageIsDisabled(profile, packageName, explicitDir) {
    const rows = rowIdsForPackage(profile, packageName, explicitDir);
    const state = readUserPatchState(userPatchPath(profile, explicitDir));
    return rows.some((id) => state.disables.includes(id));
}
export function setPackageEnabled(profile, packageName, enabled, explicitDir) {
    if (isProtectedPackage(packageName))
        return { ok: false, reason: "该插件属于宿主或本排行插件，不能在这里开关", rows: [] };
    const rows = rowIdsForPackage(profile, packageName, explicitDir);
    if (rows.length === 0)
        return { ok: false, reason: "找不到可写入的补丁行", rows };
    const patchPath = userPatchPath(profile, explicitDir);
    for (const rowId of rows) {
        const result = setRowDisabled(patchPath, rowId, !enabled);
        if (!result.ok)
            return { ...result, rows };
    }
    return { ok: true, reason: null, rows };
}
