import { parseInstallCommands } from "./install-parse.js";

type ParsedInstall = ReturnType<typeof parseInstallCommands>;

export interface CachedInstallIdentity {
  fullName: string;
  packageName?: string | null;
  repositoryPath?: string | null;
}

/** Only this audited package has known prohibited commands in existing caches. */
function hasKnownInvalidInstallEvidence(identity: CachedInstallIdentity): boolean {
  return identity.fullName.toLowerCase() === "ayuayue/pideck"
    && identity.packageName === "dsh-tool-pwsh-persistent"
    && identity.repositoryPath === "packages/dsh-tool-pwsh-persistent";
}

/** Previously repaired local-file evidence remains display-only after expiry. */
function containsOnlyLocalTarballCommands(previous: ParsedInstall): boolean {
  if (previous.commands.length === 0 || previous.commands.some((command) =>
    !/\s\.\/[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/.test(command))) return false;
  const reparsed = parseInstallCommands(`\`\`\`sh\n${previous.commands.join("\n")}\n\`\`\``);
  return reparsed.commands.length === previous.commands.length
    && previous.commands.every((command) => reparsed.commands.includes(command));
}

/**
 * Reparse exact-source README text locally, without invalidating discovery or
 * refreshing other repositories. A missing README cannot rehabilitate PiDeck's
 * audited bad commands: withhold them and request only that package's document.
 * The caller owns fetching and persisting the returned parse result.
 */
export function refreshCachedInstallEvidence(
  identity: CachedInstallIdentity,
  previous: ParsedInstall,
  selectedReadme: string | null,
): { installParsed: ParsedInstall; needsReadmeRefresh: boolean } {
  if (selectedReadme !== null) {
    return { installParsed: parseInstallCommands(selectedReadme), needsReadmeRefresh: false };
  }
  if (hasKnownInvalidInstallEvidence(identity) && !containsOnlyLocalTarballCommands(previous)) {
    return { installParsed: { commands: [], source: "template" }, needsReadmeRefresh: true };
  }
  return { installParsed: previous, needsReadmeRefresh: false };
}
