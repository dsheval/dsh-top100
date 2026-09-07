/** DSH's YAML dialect, parsed without evaluating !!js expressions. */
import { JSON_SCHEMA, Type, dump, load } from "js-yaml";
import { isDeepStrictEqual } from "node:util";
class JsExpression {
    source;
    constructor(source) {
        this.source = source;
    }
}
const expressionType = new Type("tag:yaml.org,2002:js", {
    kind: "scalar",
    resolve: (value) => typeof value === "string",
    construct: (value) => new JsExpression(String(value)),
    instanceOf: JsExpression,
    represent: (value) => value.source,
});
const schema = JSON_SCHEMA.extend(expressionType);
function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof JsExpression);
}
/** Reject recursive aliases before traversal or serializing; shared aliases are valid. */
function assertAcyclic(value, visiting = new Set(), visited = new Set()) {
    if (value === null || typeof value !== "object" || visited.has(value))
        return;
    if (visiting.has(value))
        throw new Error("DSH 补丁包含循环 YAML alias");
    visiting.add(value);
    for (const child of Object.values(value))
        assertAcyclic(child, visiting, visited);
    visiting.delete(value);
    visited.add(value);
}
function validateRows(rows) {
    if (!Array.isArray(rows))
        throw new Error("DSH insert 必须是加载行数组");
    for (const row of rows) {
        if (!record(row))
            throw new Error("DSH 加载行必须是对象");
        if ("id" in row && (typeof row.id !== "string" || !row.id))
            throw new Error("DSH 加载行 id 必须是非空字符串");
        if ("name" in row && typeof row.name !== "string")
            throw new Error("DSH 加载行 name 必须是字符串");
        if (row.group === true && row.config !== undefined)
            validateRows(row.config);
    }
}
export function readDshPatch(source) {
    let value;
    try {
        value = load(source, { schema });
    }
    catch (error) {
        const mark = error !== null && typeof error === "object" && "mark" in error
            ? error.mark : undefined;
        const position = typeof mark?.line === "number" ? `（第 ${mark.line + 1} 行）` : "";
        // YAMLException.message embeds source lines, which may contain user credentials.
        throw new Error(`DSH 补丁 YAML 语法无效${position}`);
    }
    assertAcyclic(value);
    if (!Array.isArray(value))
        throw new Error("DSH 补丁必须是 YAML 数组");
    for (const patch of value) {
        if (!record(patch))
            throw new Error("DSH 补丁条目必须是对象");
        if ("id" in patch && (typeof patch.id !== "string" || !patch.id))
            throw new Error("DSH 补丁 id 必须是非空字符串");
        if ("insert" in patch)
            validateRows(patch.insert);
        else if (typeof patch.id !== "string" || !patch.id)
            throw new Error("DSH 非 insert 补丁必须指定 id");
    }
    return value;
}
export function writeDshPatch(patches) {
    assertAcyclic(patches);
    const output = dump(patches, { schema, lineWidth: -1, noRefs: false });
    if (!isDeepStrictEqual(readDshPatch(output), patches))
        throw new Error("DSH 补丁序列化改变了配置语义，已拒绝写入");
    return output;
}
/** Visit loader rows only: ordinary plugin configuration is not a loader tree. */
export function insertedRows(patches) {
    const found = [];
    const collect = (rows) => {
        for (const row of rows) {
            found.push(row);
            if (row.group === true && Array.isArray(row.config))
                collect(row.config);
        }
    };
    for (const patch of patches)
        if (Array.isArray(patch.insert))
            collect(patch.insert);
    return found;
}
/** Static application follows include.applyEntryPatches; !!js remains unevaluated. */
export function applyDshPatches(patches) {
    const entries = [];
    const byId = new Map();
    const index = (rows) => {
        for (const row of rows) {
            if (typeof row.id === "string")
                byId.set(row.id, row);
            if (row.group && Array.isArray(row.config))
                index(row.config);
        }
    };
    for (const patch of readDshPatch(writeDshPatch([...patches]))) {
        const { id, insert, name, ...overrides } = patch;
        if (Array.isArray(insert)) {
            if (id) {
                const target = byId.get(String(id));
                if (!target?.group)
                    continue;
                if (!Array.isArray(target.config))
                    target.config = [];
                target.config.push(...insert);
            }
            else
                entries.push(...insert);
            index(insert);
        }
        else {
            const target = byId.get(String(id));
            if (!target || (name && name !== target.name))
                continue;
            Object.assign(target, overrides);
        }
    }
    return entries;
}
export function disabledRowIds(rows) {
    const disabled = new Set();
    const visit = (entries, parentDisabled) => {
        for (const row of entries) {
            const isDisabled = parentDisabled || row.disabled === true;
            if (isDisabled && typeof row.id === "string")
                disabled.add(row.id);
            if (row.group && Array.isArray(row.config))
                visit(row.config, isDisabled);
        }
    };
    visit(rows, false);
    return disabled;
}
