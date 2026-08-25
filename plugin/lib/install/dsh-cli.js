/** Spawn `dsh plugin` the same way the official CLI forwards to pnpm. */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { SAFE_TARGET_RE } from "./install-spec.js";
const INSTALL_TIMEOUT_MS = Number(process.env.DSH_TOP100_INSTALL_TIMEOUT_MS) || 15 * 60 * 1000;
const CMD_METACHARS = /[\s"&|<>^()%!]/;
const winCmdShim = process.platform === "win32";
const COMSPEC = process.env.ComSpec ?? "cmd.exe";
export const progress = {
    active: false,
    fullName: null,
    spec: null,
    lastLine: "",
    startedAt: null,
    error: null,
};
let activeChild = null;
let cancelRequested = false;
function nodeExecutable(argv0 = process.argv0, execPath = process.execPath) {
    if (argv0 && isAbsolute(argv0) && existsSync(argv0))
        return argv0;
    return execPath;
}
export function quoteCmdArg(arg) {
    if (!CMD_METACHARS.test(arg))
        return arg;
    return `"${arg.replace(/"/g, '""')}"`;
}
export function cmdCommandLine(argv) {
    return argv.map(quoteCmdArg).join(" ");
}
function spawnShim(file, args, options) {
    const { viaShell = false, ...spawnOptions } = options;
    if (!viaShell || process.platform !== "win32") {
        return spawn(file, [...args], { ...spawnOptions, shell: false });
    }
    return spawn(COMSPEC, ["/d", "/s", "/c", `"${cmdCommandLine([file, ...args])}"`], {
        ...spawnOptions,
        shell: false,
        windowsVerbatimArguments: true,
    });
}
export function dshArgv() {
    const entry = process.argv[1];
    if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
        const abs = resolve(entry);
        return { file: nodeExecutable(), args: [...process.execArgv, abs], cwd: dirname(abs), viaShell: false };
    }
    return { file: "dsh", args: [], cwd: undefined, viaShell: winCmdShim };
}
function killTree(child) {
    if (process.platform === "win32" && child.pid !== undefined) {
        try {
            spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
            return;
        }
        catch {
            /* fall through */
        }
    }
    const signalTree = (signal) => {
        if (child.pid === undefined)
            return;
        try {
            process.kill(-child.pid, signal);
        }
        catch {
            try {
                child.kill(signal);
            }
            catch {
                /* already gone */
            }
        }
    };
    signalTree("SIGTERM");
    const escalate = setTimeout(() => signalTree("SIGKILL"), 5000);
    escalate.unref?.();
}
export function cancelActive() {
    if (activeChild === null)
        return false;
    cancelRequested = true;
    killTree(activeChild);
    return true;
}
function rememberLine(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0)
        progress.lastLine = lines[lines.length - 1].slice(0, 200);
}
export function runDshPlugin(profile, pluginArgs, meta) {
    const target = pluginArgs[pluginArgs.length - 1] ?? "";
    if (!SAFE_TARGET_RE.test(target)) {
        return Promise.resolve({
            exitCode: 1,
            timedOut: false,
            stdout: "",
            stderr: `unsafe plugin target rejected: ${JSON.stringify(target)}`,
            cancelled: false,
        });
    }
    const { file, args, cwd, viaShell } = dshArgv();
    progress.active = true;
    progress.fullName = meta?.fullName ?? null;
    progress.spec = target;
    progress.lastLine = "";
    progress.startedAt = Date.now();
    progress.error = null;
    cancelRequested = false;
    return new Promise((resolvePromise) => {
        const child = spawnShim(file, [...args, "plugin", "--profile", profile, ...pluginArgs], {
            cwd,
            env: { ...process.env, CI: "true" },
            stdio: ["ignore", "pipe", "pipe"],
            viaShell,
            detached: process.platform !== "win32",
        });
        activeChild = child;
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            killTree(child);
        }, INSTALL_TIMEOUT_MS);
        child.stdout?.on("data", (chunk) => {
            const text = chunk.toString();
            stdout = (stdout + text).slice(-256 * 1024);
            rememberLine(text);
        });
        child.stderr?.on("data", (chunk) => {
            const text = chunk.toString();
            stderr = (stderr + text).slice(-64 * 1024);
            rememberLine(text);
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            progress.active = false;
            progress.error = error.message;
            if (activeChild === child)
                activeChild = null;
            resolvePromise({
                exitCode: 127,
                timedOut: false,
                stdout,
                stderr: `${stderr}\n${error.message}`,
                cancelled: false,
            });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            progress.active = false;
            if (activeChild === child)
                activeChild = null;
            if (code !== 0 || timedOut)
                progress.error = stderr.slice(-200) || `exit ${String(code)}`;
            resolvePromise({
                exitCode: code,
                timedOut,
                stdout,
                stderr,
                cancelled: cancelRequested,
            });
        });
    });
}
