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
