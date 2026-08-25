import type { Translate } from "./locales.js";

interface SettingsCardProps {
  t: Translate;
}

export function SettingsCard({ t }: SettingsCardProps) {
  return (
    <div className="dsh-top100">
      <h3>{t("cardTitle")}</h3>
      <p className="lede">{t("cardHint")}</p>
    </div>
  );
}
