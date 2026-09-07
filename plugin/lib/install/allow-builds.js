/** Persist explicitly verified pnpm build-script permissions. */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { dump, load } from "js-yaml";
import { profileDir } from "../host/profile.js";
const PACKAGE_KEY_RE = /^[A-Za-z0-9@/_.-]+$/;
const GIT_KEY_RE = /^[A-Za-z0-9@/_.-]+@git\+https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/;
const CODELOAD_KEY_RE = /^[A-Za-z0-9@/_.-]+@https:\/\/codeload\.github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/tar\.gz\/[0-9a-f]{40}$/;
function validKey(key) {
    return PACKAGE_KEY_RE.test(key) || GIT_KEY_RE.test(key) || CODELOAD_KEY_RE.test(key);
}
function isMapping(value) {
    return value !== null && typeof value === "object"
        && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function workspaceDocument(source) {
    const stack = [];
    const approvals = Object.create(null);
    let root;
    let duplicates = false;
    const document = load(source, {
        // Capture pairs before duplicate keys collapse; flow nodes can have extra wrappers.
        json: true,
        listener(event, state) {
            if (event === "open") {
                stack.push({ kind: "", result: undefined, children: [] });
                return;
            }
            const node = stack.pop();
            node.kind = state.kind;
            node.result = state.result;
            if (stack.length > 0)
                stack.at(-1).children.push(node);
            else
                root = node;
        },
    });
    function unwrap(node) {
        while (node.children.length === 1 && node.children[0].result === node.result)
            node = node.children[0];
        return node;
    }
    function inspect(raw, topLevel) {
        const node = unwrap(raw);
        if (node.kind === "mapping") {
            const keys = new Set();
            for (let index = 0; index < node.children.length; index += 2) {
                const key = node.children[index].result;
                if (typeof key !== "string")
                    throw new Error("工作区配置需要字符串映射键");
                const allowedDuplicate = topLevel && key === "allowBuilds";
                if (keys.has(key)) {
                    if (!allowedDuplicate)
                        throw new Error(`工作区配置包含重复映射键：${key}`);
                    duplicates = true;
                }
                keys.add(key);
                if (topLevel && key === "allowBuilds") {
                    const value = node.children[index + 1]?.result;
                    if (value !== null && !isMapping(value))
                        throw new Error("allowBuilds 必须是布尔值映射");
                    for (const [name, decision] of Object.entries(value ?? {})) {
                        if (typeof decision !== "boolean")
                            throw new Error(`allowBuilds 中 ${name} 必须是 true 或 false`);
                        approvals[name] = decision;
                    }
                }
            }
        }
        for (const child of node.children)
            inspect(child, false);
    }
    if (root)
        inspect(root, true);
    const visiting = new Set();
    function assertAcyclic(value) {
        if (value === null || typeof value !== "object")
            return;
        if (visiting.has(value))
            throw new Error("工作区配置包含递归 YAML 引用，无法安全合并");
        visiting.add(value);
        for (const child of Object.values(value))
            assertAcyclic(child);
        visiting.delete(value);
    }
    assertAcyclic(document);
    if (document !== undefined && document !== null && !isMapping(document))
        throw new Error("工作区配置必须是映射");
    const inherited = isMapping(document) ? document.allowBuilds : undefined;
    if (inherited !== undefined && inherited !== null) {
        if (!isMapping(inherited))
            throw new Error("allowBuilds 必须是布尔值映射");
        for (const [name, decision] of Object.entries(inherited)) {
            if (typeof decision !== "boolean")
                throw new Error(`allowBuilds 中 ${name} 必须是 true 或 false`);
            if (!Object.hasOwn(approvals, name))
                approvals[name] = decision;
        }
    }
    return { document: (document ?? {}), approvals, duplicates };
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
    catch (error) {
        if (error.code !== "ENOENT")
            throw error;
    }
    const { document, approvals, duplicates } = workspaceDocument(source);
    if (!duplicates && requested.every((key) => approvals[key] === true))
        return false;
    for (const key of requested)
        approvals[key] = true;
    document.allowBuilds = { ...approvals };
    const next = dump(document, { lineWidth: -1, noRefs: true }).replace(/\n/g, source.includes("\r\n") ? "\r\n" : "\n");
    const roundTrip = load(next);
    if (!isDeepStrictEqual(roundTrip, document))
        throw new Error("工作区配置序列化校验失败，已停止修改");
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temporary, next, "utf8");
    renameSync(temporary, path);
    return true;
}
