import { describe, expect, it } from "vitest";
import { en, zh, type Translate } from "../src/client/locales.js";
import { presentCatalogEvidence, presentInstallRisk } from "../src/client/trust-presentation.js";
import type { CatalogEvidence, InstallRiskEvidence } from "../src/shared/types.js";

function translator(dictionary: Record<string, string>): Translate {
  return (key) => dictionary[key] ?? key;
}

const evidence: CatalogEvidence = {
  formFactor: "dsh-bundle",
  compatible: true,
  trustLevel: "install-source",
  signalCodes: ["indexed", "dsh-bundle", "install-source"],
  caveatCode: "not-security-review",
  signals: ["已进入 DSHEval 索引", "命中 DSH Bundle 结构", "安装源可解析（npm）"],
  caveat: "这些证据不代表代码已通过安全审核。",
};

describe("trust evidence presentation", () => {
  it("uses the active English locale instead of host fallback prose", () => {
    const presented = presentCatalogEvidence(evidence, "npm", translator(en));
    expect(presented.signals).toEqual([
      "Listed in the DSHEval index",
      "Matches the DSH Bundle structure",
      "Install source resolved (npm)",
    ]);
    expect(presented.caveat).toContain("not a security review");
    expect(presented.caveat).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("keeps lifecycle commands verbatim while localizing their warning", () => {
    const risk: InstallRiskEvidence = {
      code: "lifecycle-scripts",
      severity: "warning",
      summary: "安装会执行包生命周期脚本",
      detail: "prepare: npm run build",
    };
    expect(presentInstallRisk(risk, translator(en))).toEqual({
      summary: "Installation will run package lifecycle scripts",
      detail: "prepare: npm run build",
    });
  });

  it("presents restart guidance in Chinese when Chinese is active", () => {
    const risk: InstallRiskEvidence = {
      code: "restart-required",
      severity: "info",
      summary: "host fallback",
      detail: "host fallback",
    };
    const presented = presentInstallRisk(risk, translator(zh));
    expect(presented.summary).toContain("重启");
    expect(presented.detail).toContain("当前 DSH 进程");
  });
});
