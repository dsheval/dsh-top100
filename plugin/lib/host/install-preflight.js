/** Resolve immutable install evidence before the user is asked to approve a profile change. */
import { randomUUID } from "node:crypto";
import { resolveInstallSpec } from "../install/install-spec.js";
import { verifyInstallSpec } from "../install/install-verify.js";
import { verifySkillSource } from "../install/skill-install.js";
const APPROVAL_TTL_MS = 10 * 60 * 1000;
const approvals = new Map();
function removeExpiredApprovals(now = Date.now()) {
    for (const [token, approval] of approvals) {
        if (approval.preflight.expiresAt <= now)
            approvals.delete(token);
    }
}
function bundleProvenance(value) {
    return {
        source: value.source,
        requestedTarget: value.requestedTarget,
        resolvedTarget: value.target,
        packageName: value.packageName,
        version: value.version,
        commit: value.commit,
        integrity: value.integrity,
        repositoryUrl: value.repositoryUrl,
        repositoryIdentity: value.repositoryIdentity,
        verifiedAt: value.verifiedAt,
    };
}
function bundleRisks(value) {
    const risks = [];
    if (value.lifecycleScripts.length > 0) {
        risks.push({
            code: "lifecycle-scripts",
            severity: "warning",
            summary: "安装会执行包生命周期脚本",
            detail: value.lifecycleScripts.map((script) => `${script.name}: ${script.command}`).join("\n"),
        });
    }
    if (value.repositoryIdentity === "unavailable") {
        risks.push({
            code: "repository-identity",
            severity: "warning",
            summary: "npm 包未能与目录仓库自动绑定",
            detail: "包未声明可识别的 GitHub repository；精确版本已锁定，但发布者身份仍需人工判断。",
        });
    }
    risks.push({
        code: "restart-required",
        severity: "info",
        summary: "写入成功后仍需重启并验证运行状态",
        detail: "安装后的配置检查只证明 Profile 可以组合，不代表插件已经在当前 DSH 进程中运行。",
    });
    return risks;
}
export async function createInstallPreflight(entry, profile) {
    removeExpiredApprovals();
    const approvalToken = randomUUID();
    const expiresAt = Date.now() + APPROVAL_TTL_MS;
    if (entry.type?.toLowerCase() === "skill") {
        const skillSource = await verifySkillSource(entry.fullName);
        const provenance = {
            source: "github",
            requestedTarget: `github:${entry.fullName}`,
            resolvedTarget: `github:${entry.fullName}#${skillSource.commit}`,
            packageName: null,
            version: null,
            commit: skillSource.commit,
            integrity: `git-sha1-${skillSource.commit}`,
            repositoryUrl: skillSource.repositoryUrl,
            repositoryIdentity: "matched",
            verifiedAt: skillSource.verifiedAt,
        };
        const preflight = {
            approvalToken,
            expiresAt,
            fullName: entry.fullName,
            profile,
            kind: "skill",
            provenance,
            lifecycleScripts: [],
            risks: [{
                    code: "skill-content",
                    severity: "warning",
                    summary: "Skill 是会影响模型行为的主动内容",
                    detail: "将复制该 commit 中的 SKILL.md、脚本、模板和资源；安装器拒绝符号链接，但不把结构验证表述为安全审核。",
                }],
            requiresExplicitApproval: true,
            activationExpectation: entry.install?.needsConfig ? "configuration-required" : "not-applicable",
        };
        const approved = { entry, preflight, bundleTarget: null, skillSource };
        approvals.set(approvalToken, approved);
        return approved;
    }
    const spec = resolveInstallSpec(entry);
    if (!spec)
        throw new Error("this catalog entry has no trusted DSH install source");
    const bundleTarget = await verifyInstallSpec(spec, {
        expectedRepository: entry.fullName,
        expectedPackageName: entry.install?.packageName,
        expectedRepositoryPath: entry.install?.repositoryPath,
    });
    const risks = bundleRisks(bundleTarget);
    const preflight = {
        approvalToken,
        expiresAt,
        fullName: entry.fullName,
        profile,
        kind: "bundle",
        provenance: bundleProvenance(bundleTarget),
        lifecycleScripts: bundleTarget.lifecycleScripts,
        risks,
        requiresExplicitApproval: risks.some((risk) => risk.severity === "warning"),
        activationExpectation: entry.install?.needsConfig ? "configuration-required" : "restart-required",
    };
    const approved = { entry, preflight, bundleTarget, skillSource: null };
    approvals.set(approvalToken, approved);
    return approved;
}
export function consumeInstallApproval(token, fullName, profile, risksAccepted = false) {
    removeExpiredApprovals();
    const approval = approvals.get(token);
    if (!approval)
        throw new Error("安装确认已过期，请重新检查精确来源与风险");
    if (approval.preflight.fullName !== fullName || approval.preflight.profile !== profile) {
        throw new Error("安装确认与当前插件或 Profile 不匹配");
    }
    if (approval.preflight.requiresExplicitApproval && !risksAccepted) {
        throw new Error("该安装包含警告项，需要明确确认来源、脚本与风险");
    }
    approvals.delete(token);
    return approval;
}
export function clearInstallApprovals() {
    approvals.clear();
}
