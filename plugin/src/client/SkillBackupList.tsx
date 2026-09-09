import type { InstallJobSnapshot } from "../shared/types.js";
import type { Translate } from "./locales.js";

export function SkillBackupList({ jobs, t }: { jobs: InstallJobSnapshot[]; t: Translate }) {
  const backups = jobs.flatMap((job) => job.skillBackups ?? []);
  if (!backups.length) return null;
  return <div className="banner" role="status"><strong>{t("skillBackupSaved")}</strong>
    <p>{t("skillBackupSavedHint")}</p>
    {backups.map((backup) => <p key={backup.path}>{backup.name} · <code>{backup.path}</code></p>)}
  </div>;
}
