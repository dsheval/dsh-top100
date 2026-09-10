/** pnpm compatibility and one-shot network recovery for profile package mutations. */
import { existsSync } from "node:fs";
import { join } from "node:path";
/** pnpm 9 needs `-w` at a workspace root; every pnpm version rejects it outside one. */
export function pluginArgsFor(directory, args) {
    if (args[0] !== "add" && args[0] !== "remove")
        return args;
    // The approved version must remain exact on disk so its original channel can
    // be recovered from provenance on the next update.
    if (args[0] === "add" && !args.includes("--save-exact") && !args.includes("-E")) {
        args = [args[0], "--save-exact", ...args.slice(1)];
    }
    if (!existsSync(join(directory, "pnpm-workspace.yaml")))
        return args;
    if (args.includes("-w") || args.includes("--workspace-root"))
        return args;
    return [args[0], "-w", ...args.slice(1)];
}
function decodedOutput(output) {
    const messages = [];
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{"))
            continue;
        try {
            const event = JSON.parse(trimmed);
            for (const field of [event.code, event.message, event.err?.code, event.err?.message]) {
                if (typeof field === "string")
                    messages.push(field);
            }
        }
        catch {
            // Preserve human or truncated output below.
        }
    }
    return `${output}\n${messages.join("\n")}`.replace(/\u001b\[[0-9;]*m/g, "");
}
/** Classify a failed command's output; warnings alone do not establish failure. */
export function classifyPnpmFailure(raw) {
    const output = decodedOutput(raw);
    // Explicit policy/build failures take precedence over earlier network warnings.
    if (/ERR_PNPM_IGNORED_BUILDS/.test(output)) {
        return {
            code: "ignored-builds",
            message: "依赖的构建脚本尚未获准。请在当前 Profile 查看并审核日志列出的依赖，再重试安装。",
        };
    }
    if (/ERR_PNPM_PEER_DEP_ISSUES/.test(output)) {
        return {
            code: "peer-dependency",
            message: "插件与当前 Profile 的 peer 依赖不兼容。请按日志核对宿主和插件版本后重试。",
        };
    }
    if (/ERR_PNPM_PREPARE_PACKAGE|\bprepare:\s*(?:Failed|\[?ELIFECYCLE\]?)/i.test(output)) {
        return {
            code: "prepare-failed",
            message: "作者源码包的 prepare 构建失败。请查看构建日志并核对作者的构建前提；也可选用作者提供的预构建包。",
        };
    }
    if (/\bELIFECYCLE\b|ERR_PNPM_(?:RECURSIVE_RUN_FIRST_FAIL|EXEC_LIFECYCLE)/.test(output)) {
        return {
            code: "lifecycle-failed",
            message: "安装脚本执行失败。请查看脚本日志并核对作者要求的构建环境后重试。",
        };
    }
    if (/ERR_PNPM_(?:PUBLIC_HOIST_PATTERN|VIRTUAL_STORE_DIR_MAX_LENGTH)_DIFF/.test(output)) {
        return {
            code: "hoist-drift",
            message: "当前 Profile 的 node_modules 与 pnpm 配置不一致。请核对 pnpm 版本和 Profile 配置后修复依赖。",
        };
    }
    if (/minimumReleaseAge|ERR_PNPM_MISMATCHED_RELEASE_CHANNEL|release is too new/i.test(output)) {
        return {
            code: "release-age",
            message: "pnpm 的版本等待期或发布渠道策略阻止了安装。请等待策略允许，或明确调整当前 Profile 的策略后重试。",
        };
    }
    const hostPeer = /ERR_PNPM_FETCH_404[\s\S]{0,800}?(@deepseek-ai(?:\/|%2f)[a-z0-9._-]+)/i.exec(output)?.[1];
    if (hostPeer) {
        return {
            code: "host-peer",
            packageName: hostPeer.replace(/%2f/i, "/"),
            message: "无法从 npm 获取所需的 DSH 包。请核对包版本、registry 和宿主依赖配置后重试。",
        };
    }
    const network = /ERR_PNPM_FETCH_5\d\d|ERR_PNPM_META_FETCH_FAIL|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ENOTFOUND|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT|socket hang up|(?:timed?\s*out|TimeoutError)|operation was aborted due to timeout/i;
    const gitRequest = /(?:HEAD|GET)\s+https:\/\/(?:codeload\.)?github\.com\//i;
    if (output.split(/\r?\n/).some((line) => gitRequest.test(line) && network.test(line))
        || (/\bgit\s+(?:ls-remote|fetch|clone)\b|fatal: unable to access/i.test(output) && network.test(output))) {
        return {
            code: "git-network",
            message: "Git 源连接失败。请检查仓库访问和代理配置后重试；也可选用作者提供的 npm 包或归档。",
        };
    }
    if (/operation was aborted due to timeout|TimeoutError|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT/i.test(output)) {
        return {
            code: "fetch-timeout",
            message: "插件下载请求超时。请检查网络和代理，必要时明确调整 pnpm 下载时限后重试。",
        };
    }
    if (network.test(output)) {
        return {
            code: "transient-network",
            message: "下载遇到网络错误。请检查网络、代理和 registry 配置后重试。",
        };
    }
    return null;
}
function succeeded(result) {
    return result.exitCode === 0 && !result.timedOut && !result.cancelled;
}
const RETRY_LOG_MARKER = "\n\n[Top100 retry]\n";
function latestOutput(output) {
    const index = output.lastIndexOf(RETRY_LOG_MARKER);
    return index < 0 ? output : output.slice(index + RETRY_LOG_MARKER.length);
}
/** UI summary only. Keep stdout/stderr as the unabridged details of both attempts. */
export function classifyInstallFailure(result) {
    if (result.cancelled)
        return { code: "cancelled", message: "安装已取消。" };
    if (result.timedOut)
        return { code: "install-timeout", message: "安装超过总时限。请查看最后的执行日志，确认网络或构建前提后重试。" };
    if (succeeded(result))
        return null;
    return classifyPnpmFailure(`${latestOutput(result.stdout)}\n${latestOutput(result.stderr)}`)
        ?? { code: "install-failed", message: "安装失败。请展开日志查看具体原因。" };
}
/** Retry only transport failures, once, with the user's exact options and policy. */
export async function withPnpmRecovery(run, profile, args, _explicitDir) {
    const first = await run(profile, args);
    const failure = classifyInstallFailure(first);
    if ((args[0] !== "add" && args[0] !== "remove")
        || !failure
        || !["git-network", "fetch-timeout", "transient-network"].includes(failure.code))
        return first;
    // No config overrides, build approvals, lockfile repair, or extra commands.
    const retried = await run(profile, args);
    return {
        ...retried,
        stdout: `${first.stdout}${RETRY_LOG_MARKER}${retried.stdout}`,
        stderr: `${first.stderr}${RETRY_LOG_MARKER}${retried.stderr}`,
    };
}
