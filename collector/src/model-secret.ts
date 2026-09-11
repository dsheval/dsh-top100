import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import type { Stats } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const failureMessage = "DEEPSEEK_API_KEY_FILE could not be securely loaded; model credentials are unavailable.";

export class ModelSecretError extends Error {
  constructor() { super(failureMessage); this.name = "ModelSecretError"; }
}

function within(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

/** Read only the explicitly configured secret. Errors never include paths or file contents. */
export function loadModelApiKey(
  env: NodeJS.ProcessEnv = process.env,
  repoRoot = repositoryRoot,
): string | undefined {
  const configured = env.DEEPSEEK_API_KEY_FILE?.trim();
  if (!configured) return env.DEEPSEEK_API_KEY?.trim() || undefined;
  let fd: number | undefined;
  try {
    if (!isAbsolute(configured) || within(resolve(repoRoot), resolve(configured))) throw new ModelSecretError();
    const physicalRoot = realpathSync(repoRoot);
    const physicalPath = realpathSync(configured);
    if (within(physicalRoot, physicalPath)) throw new ModelSecretError();
    const before = lstatSync(configured);
    const uid = process.geteuid?.();
    const valid = (stat: Stats) => stat.isFile() && !stat.isSymbolicLink()
      && (stat.mode & 0o7777) === 0o600 && uid !== undefined && stat.uid === uid
      && stat.nlink === 1 && stat.size > 0 && stat.size <= 16_384;
    if (!valid(before)) throw new ModelSecretError();
    fd = openSync(configured, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!valid(opened) || opened.dev !== before.dev || opened.ino !== before.ino
      || realpathSync(configured) !== physicalPath) throw new ModelSecretError();
    const key = readFileSync(fd, "utf8").trim();
    if (!key || /\s/.test(key)) throw new ModelSecretError();
    return key;
  } catch {
    throw new ModelSecretError();
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* Never reveal a filesystem exception or a credential. */ }
    }
  }
}

/** Preserve existing env-key compatibility; an explicit file always takes precedence. */
export function applyModelApiKey(env: NodeJS.ProcessEnv = process.env, repoRoot = repositoryRoot): void {
  if (env.DEEPSEEK_API_KEY_FILE?.trim()) delete env.DEEPSEEK_API_KEY;
  const key = loadModelApiKey(env, repoRoot);
  if (key) env.DEEPSEEK_API_KEY = key;
  else delete env.DEEPSEEK_API_KEY;
}
