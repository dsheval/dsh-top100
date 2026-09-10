/** A selected subpackage may only use its own README as content/install evidence. */
import { cached, cacheGet } from "./cache.js";
import { fetchRawFile } from "./github.js";
import { createHash } from "node:crypto";

const README_TTL_MS = 24 * 3600_000;
export const SOURCE_DOCUMENT_CACHE_VERSION = 2;

function documentKey(fullName: string, path: string, revision: string, branch?: string | null): string {
  return `v${SOURCE_DOCUMENT_CACHE_VERSION}:${createHash("sha256").update(JSON.stringify([
    fullName.toLowerCase(), path, revision, branch ?? "HEAD",
  ])).digest("hex")}`;
}

function readmeLocation(fullName: string, pluginPath: string | null, revision: string, branch?: string | null) {
  const path = pluginPath ? `${pluginPath}/README.md` : "README.md";
  return {
    path,
    key: documentKey(fullName, path, revision, branch),
  };
}

export async function loadSelectedReadme(fullName: string, pluginPath: string | null, revision: string, branch?: string | null): Promise<string | null> {
  const location = readmeLocation(fullName, pluginPath, revision, branch);
  // Only a confirmed missing document is null. Transient reads must abort the
  // detection attempt, preserving the previous market entry for later review.
  return cached<string | null>("readmes", location.key,
    () => fetchRawFile(fullName, location.path, branch), README_TTL_MS);
}

/** A detection-cache hit must obey the same source boundary as a fresh read. */
export function getCachedSelectedReadme(fullName: string, pluginPath: string | null, revision: string, branch?: string | null): string | null {
  return cacheGet<string | null>("readmes", readmeLocation(fullName, pluginPath, revision, branch).key, README_TTL_MS);
}

export async function loadSelectedSkill(fullName: string, path: string, revision: string, branch?: string | null): Promise<string | null> {
  return cached<string | null>("skills", documentKey(fullName, path, revision, branch),
    () => fetchRawFile(fullName, path, branch), README_TTL_MS);
}
