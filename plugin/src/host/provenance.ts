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
  schema: "dsh-top100/provenance/v1";
  records: Record<string, ProvenanceLedgerEntry>;
}

function ledgerPath(config: PluginResolvedConfig): string {
  return join(profileDir(config.profile, config.profileDirectory), ".dsh-top100", "provenance.json");
}

function readLedger(path: string): ProvenanceLedger {
  if (!existsSync(path)) return { schema: "dsh-top100/provenance/v1", records: {} };
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<ProvenanceLedger>;
    if (value.schema === "dsh-top100/provenance/v1" && value.records && typeof value.records === "object") {
      return value as ProvenanceLedger;
    }
    throw new Error("schema mismatch");
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
  ledger.records[preflight.fullName.toLowerCase()] = {
    fullName: preflight.fullName,
    profile: config.profile,
    installedAt: Date.now(),
    preflight: persistedPreflight,
    skills: skills.map(({ name, commit, digest, files }) => ({ name, commit, digest, files })),
  };
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
