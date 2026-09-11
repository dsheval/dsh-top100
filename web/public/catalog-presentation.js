import { catalogSourceStatus, discoveryNeedsReview } from "./install-assessment.js";
/** Conservative website presentation for public catalog entries.
 * Mirrors the DSH plugin's allow-listed install target rules without executing catalog commands.
 */

import { resolveCatalogInstallTarget } from "./install-source.js";

export function resolveInstallTarget(entry) {
  return resolveCatalogInstallTarget(entry ?? {});
}

export function installCommand(entry) {
  const target = resolveInstallTarget(entry);
  return target
    ? `npx @deepseek-ai/dsh plugin --profile web add ${target}`
    : null;
}

export function catalogInstallCapability(entry) {
  if (discoveryNeedsReview(entry)) return { label: "收录依据待复核", reason: "仓库结构尚未重新确认，历史收录不代表当前可安装" };
  const status = catalogSourceStatus(entry);
  const assessments = {
    verified: { label: "来源已预检", reason: "已核对清单元数据中的来源、Bundle 声明及版本；发布归档、安装、宿主兼容与功能仍需验证" },
    invalid: { label: "来源预检未通过", reason: "来源结构或身份检查未通过，可重新预检或查看作者说明" },
    unavailable: { label: "来源暂未确认", reason: "本次未能完成来源检查，可能为网络或限流；不代表无法安装" },
    stale: { label: "来源需重新预检", reason: "历史来源检查已过期，安装前需重新核对当前版本" },
  };
  if (assessments[status] && !(status === "verified" && (entry?.install?.needsConfig ?? entry?.needsConfig))) return assessments[status];
  if (!resolveInstallTarget(entry)) {
    return { label: "未识别安装源", reason: "暂未识别到与当前项目匹配的安装源，不代表无法安装；请查看 GitHub 说明" };
  }
  if ((entry?.install?.needsConfig ?? entry?.needsConfig) === true) {
    return { label: "安装后需配置", reason: "项目声明需要额外配置，请先阅读安装说明" };
  }
  return { label: "已识别安装源", reason: "可解析安装来源；不保证安装成功，配置要求仍需查看项目说明" };
}

export function catalogPresentation(entry) {
  const type = String(entry?.type ?? "").toLowerCase();
  const target = resolveInstallTarget(entry);
  const discovery = entry?.install?.discovery ?? entry?.discovery;
  const structured = !discoveryNeedsReview(entry) && (type === "skill" || type === "cordis-plugin" || type === "cordis");
  const formFactor = type === "skill"
    ? "Skill"
    : structured
      ? discovery?.status === "verified" && discovery.kind === "bundle"
        ? "DSH Bundle"
        : discovery?.status === "verified" && discovery.kind === "client"
          ? "DSH 客户端插件"
          : "DSH 插件"
      : "生态项目";
  return {
    formFactor,
    trustLevel: target ? "install-source" : structured ? "structured" : "indexed",
    trustLabel: target ? "安装源可解析" : structured ? "结构已识别" : "已进入索引",
    installable: Boolean(target),
  };
}
