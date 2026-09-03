/** Conservative website presentation for public catalog entries.
 * Mirrors the DSH plugin's allow-listed install target rules without executing catalog commands.
 */

const NPM_NAME = "(?:@[a-z0-9-~][a-z0-9-._~]*\\/)?[a-z0-9-~][a-z0-9-._~]*";
const NPM_SELECTOR = "[a-z0-9][a-z0-9._+-]*";
const NPM_SPEC_RE = new RegExp(`^(${NPM_NAME})(?:@${NPM_SELECTOR})?$`, "i");
const GITHUB_REPOSITORY = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}";
const GITHUB_SPEC_RE = new RegExp(
  `^github:${GITHUB_REPOSITORY}(?:#[A-Za-z0-9._~+/:=-]+)?$`,
  "i"
);
const FULL_NAME_RE = new RegExp(`^${GITHUB_REPOSITORY}$`);
const UNSAFE_TOKEN_RE = /[\s|&;<>()$`\\'"!*?]/;
const DSH_ADD_RE = /\bdsh\s+plugin\b(?:\s+--profile\s+\S+)?\s+add\s+(.+)$/i;

function parseInstallTarget(value) {
  const token = String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!token || token.startsWith("-") || UNSAFE_TOKEN_RE.test(token)) return null;
  if (token.startsWith("link:") || token.startsWith("file:") || token.startsWith("http")) return null;
  if (GITHUB_SPEC_RE.test(token) || NPM_SPEC_RE.test(token)) return token;
  return null;
}

function targetMatchesRepository(target, fullName) {
  if (!target.toLowerCase().startsWith("github:")) return false;
  const repository = target.slice("github:".length).split("#", 1)[0];
  return repository.toLowerCase() === String(fullName ?? "").toLowerCase();
}

export function resolveInstallTarget(entry) {
  const fullName = String(entry?.fullName ?? "");
  if (!FULL_NAME_RE.test(fullName)) return null;
  const candidates = [];
  const indexedTarget = parseInstallTarget(entry?.installTarget);
  if (indexedTarget) candidates.push(indexedTarget);

  for (const command of entry?.install?.commands ?? []) {
    const match = String(command).match(DSH_ADD_RE);
    if (!match) continue;
    const remainder = match[1].trim();
    if (!remainder || remainder.split(/\s+/).length !== 1) continue;
    const target = parseInstallTarget(remainder);
    if (target) candidates.push(target);
  }

  // README commands can install prerequisites or other marketplaces. Prefer an
  // explicit source for this repository, regardless of its position in the README.
  const githubTarget = candidates.find((target) => targetMatchesRepository(target, fullName));
  if (githubTarget) return githubTarget;
  const packageName = entry?.install?.packageName ?? entry?.installPackageName;
  if (typeof packageName === "string") {
    const npmTarget = candidates.find((target) =>
      target.match(NPM_SPEC_RE)?.[1].toLowerCase() === packageName.trim().toLowerCase());
    if (npmTarget) return npmTarget;
  }
  if (String(entry?.type ?? "").toLowerCase() === "skill") {
    return `github:${fullName}`;
  }
  return null;
}

export function installCommand(entry) {
  const target = resolveInstallTarget(entry);
  return target
    ? `npx @deepseek-ai/dsh plugin --profile web add ${target}`
    : null;
}

export function catalogPresentation(entry) {
  const type = String(entry?.type ?? "").toLowerCase();
  const target = resolveInstallTarget(entry);
  const structured = type === "skill" || type === "cordis-plugin" || type === "cordis";
  const formFactor = type === "skill"
    ? "Skill"
    : structured
      ? "DSH Bundle"
      : "生态项目";
  return {
    formFactor,
    trustLevel: target ? "install-source" : structured ? "structured" : "indexed",
    trustLabel: target ? "安装源可解析" : structured ? "结构已识别" : "已进入索引",
    installable: Boolean(target),
  };
}
