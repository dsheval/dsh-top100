import type { RankingEntry } from "../shared/types.js";

export interface RepositoryIdentity {
  name: string;
  owner: string;
}

export function presentRepositoryIdentity(
  entry: Pick<RankingEntry, "fullName" | "name" | "owner">,
): RepositoryIdentity {
  const path = entry.fullName.split("/").map((part) => part.trim()).filter(Boolean);
  const repositoryName = path.at(-1) || entry.name.trim() || entry.fullName;
  const sourceName = entry.name.trim();
  const nameRepeatsFullPath = sourceName.toLocaleLowerCase() === entry.fullName.trim().toLocaleLowerCase();

  return {
    name: !sourceName || nameRepeatsFullPath ? repositoryName : sourceName,
    owner: entry.owner.trim() || path[0] || "",
  };
}
