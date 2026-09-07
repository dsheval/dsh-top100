/** Durable, profile-scoped source evidence for installs performed by this plugin. */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { InstalledSkill } from "../install/skill-install.js";
import type { InstallPreflight } from "../shared/types.js";
import type { PluginResolvedConfig } from "./contracts.js";
import { profileDir } from "./profile.js";

interface ProvenanceLedgerEntry {
  fullName: string;
  profile: string;
  installedAt: number;
  preflight: Omit<InstallPreflight, "approvalToken" | "expiresAt">;
  skills: Array<Pick<InstalledSkill, "name" | "commit" | "digest" | "files">>;
}

interface ProvenanceLedger {
  schema: "dsh-top100/provenance/v2";
  records: Record<string, ProvenanceLedgerEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validEntry(value: unknown): value is ProvenanceLedgerEntry {
  if (!isRecord(value) || typeof value.fullName !== "string" || typeof value.profile !== "string"
    || typeof value.installedAt !== "number" || !Number.isFinite(value.installedAt)
    || !isRecord(value.preflight) || !isRecord(value.preflight.provenance)
    || !["bundle", "skill"].includes(String(value.preflight.kind)) || !Array.isArray(value.skills)) return false;
  const packageName = value.preflight.provenance.packageName;
  return (packageName === null || typeof packageName === "string")
    && value.skills.every((skill) => isRecord(skill) && typeof skill.name === "string"
      && typeof skill.commit === "string" && typeof skill.digest === "string" && Array.isArray(skill.files));
}

function identityRecords(entry: ProvenanceLedgerEntry): Array<[string, ProvenanceLedgerEntry]> {
  if (entry.preflight.kind === "skill") {
    return entry.skills.length > 0
      ? entry.skills.map((skill) => [`skill:${skill.name.toLowerCase()}`, { ...entry, skills: [skill] }])
      : [[`skill-source:${entry.fullName.toLowerCase()}`, entry]];
  }
  const name = entry.preflight.provenance.packageName;
  return [[name ? `bundle:${name.toLowerCase()}` : `legacy-bundle:${entry.fullName.toLowerCase()}`, entry]];
}

function ledgerPath(config: PluginResolvedConfig): string {
  return join(profileDir(config.profile, config.profileDirectory), ".dsh-top100", "provenance.json");
}

function readLedger(path: string): ProvenanceLedger {
  if (!existsSync(path)) return { schema: "dsh-top100/provenance/v2", records: {} };
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(value) || !["dsh-top100/provenance/v1", "dsh-top100/provenance/v2"].includes(String(value.schema))
      || !isRecord(value.records) || !Object.values(value.records).every(validEntry)) throw new Error("schema mismatch");
    if (value.schema === "dsh-top100/provenance/v2") return value as unknown as ProvenanceLedger;
    const records: Record<string, ProvenanceLedgerEntry> = Object.create(null);
    // Migrate known package/Skill identities. Keep any older colliding v1 records
    // under legacy keys so migration never discards evidence that still exists.
    const entries = Object.entries(value.records as Record<string, ProvenanceLedgerEntry>)
      .sort(([, left], [, right]) => right.installedAt - left.installedAt);
    for (const [oldKey, entry] of entries) {
      for (const [key, migrated] of identityRecords(entry)) {
        const destination = Object.hasOwn(records, key) ? `legacy-v1:${encodeURIComponent(oldKey)}:${key}` : key;
        records[destination] = migrated;
      }
    }
    return { schema: "dsh-top100/provenance/v2", records };
  } catch (error) {
    throw new Error(`无法安全读取已有安装来源台账，已停止修改：${error instanceof Error ? error.message : String(error)}`);
  }
}

export function assertProvenanceLedgerReadable(config: PluginResolvedConfig): void {
  const path = ledgerPath(config);
  readLedger(path);
  mkdirSync(dirname(path), { recursive: true });
  const probe = `${path}.${process.pid}.${randomUUID()}.probe`;
  try {
    writeFileSync(probe, "provenance write probe\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    throw new Error(`安装来源台账目录不可写，已停止修改：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(probe, { force: true });
  }
}

export function recordInstallProvenance(
  config: PluginResolvedConfig,
  preflight: InstallPreflight,
  skills: InstalledSkill[] = [],
): void {
  const path = ledgerPath(config);
  const temporary = `${path}.${process.pid}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  const ledger = readLedger(path);
  const { approvalToken: _approvalToken, expiresAt: _expiresAt, ...persistedPreflight } = preflight;
  const entry: ProvenanceLedgerEntry = {
    fullName: preflight.fullName,
    profile: config.profile,
    installedAt: Date.now(),
    preflight: persistedPreflight,
    skills: skills.map(({ name, commit, digest, files }) => ({ name, commit, digest, files })),
  };
  for (const [key, record] of identityRecords(entry)) ledger.records[key] = record;
  try {
    writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    if (!existsSync(path)) {
      renameSync(temporary, path);
      return;
    }
    const backup = `${path}.${process.pid}.${Date.now()}.bak`;
    renameSync(path, backup);
    try {
      renameSync(temporary, path);
      rmSync(backup, { force: true });
    } catch (error) {
      if (existsSync(backup)) renameSync(backup, path);
      throw error;
    }
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
