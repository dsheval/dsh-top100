/** Persist one explicitly confirmed pnpm build-script permission. */
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { profileDir } from "../host/profile.js";
const PACKAGE_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
export function allowPackageBuild(profile, packageName) {
    if (!PACKAGE_NAME_RE.test(packageName)) {
        throw new Error(`无效的构建许可包名：${packageName}`);
    }
    const path = join(profileDir(profile), "pnpm-workspace.yaml");
    let source = readFileSync(path, "utf8");
    const key = JSON.stringify(packageName);
    const line = `  ${key}: true`;
    if (source.split(/\r?\n/).some((entry) => entry.trim() === `${key}: true`))
        return false;
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    const start = lines.findIndex((entry) => /^allowBuilds:\s*$/.test(entry));
    if (start === -1) {
        while (lines.length > 0 && lines[lines.length - 1] === "")
            lines.pop();
        lines.push("allowBuilds:", line, "");
    }
    else {
        let insertAt = start + 1;
        while (insertAt < lines.length && (lines[insertAt].startsWith("  ") || lines[insertAt].trim() === "")) {
            insertAt += 1;
        }
        lines.splice(insertAt, 0, line);
    }
    source = lines.join("\n");
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, source, "utf8");
    renameSync(temporary, path);
    return true;
}
