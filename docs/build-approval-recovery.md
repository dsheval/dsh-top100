# 构建脚本未获批准时如何恢复

遇到 `ERR_PNPM_IGNORED_BUILDS`，说明依赖需要运行构建脚本，但 pnpm 尚未得到相应授权。它与网络重试是不同问题；反复点击重试不会解决授权缺失。

## 先确认操作结果

在任务结果中查看“原有依赖已恢复”或“自动恢复失败”。若恢复失败，先检查技术详情、修复当前 Profile，不继续安装。恢复成功也不等于目标插件已安装。

错误卡片显示“当前插件目录”。Web 默认是 `~/.dsh/profiles/web`；自定义 DSH_HOME、Profile 或 Desktop 应以实际任务目录为准，不要在 DSH 源码根目录配置这些依赖权限。

## 仍有待批准项目时

在实际 Profile 目录执行 `pnpm --version`，确认使用与 DSH 安装操作相同的 pnpm。支持 `approve-builds` 的版本可以运行 `pnpm approve-builds`，逐项核对来源和构建脚本后决定是否批准。

Top100 失败后会尝试恢复原有依赖，因此该命令可能显示“没有待批准的包”。这不代表原问题已解决；已回滚的依赖不再出现在审批列表中。

## 回滚后没有待批准项目时：pnpm 11

确认信任日志列出的依赖及其脚本后，在实际 Profile 的 `pnpm-workspace.yaml` 中合并精确授权。例如报错是 `node-pty@1.1.0` 时：

```yaml
allowBuilds:
  'node-pty@1.1.0': true
```

如果已有 `allowBuilds`，向现有映射追加条目，保留其他设置和拒绝项，不要添加重复的 `allowBuilds` 块。若相同条目已有 `false`，先确认此前拒绝的原因，不直接覆盖。没有此文件时才新建文件。每项授权允许该依赖执行构建脚本；不要改成通配放行或关闭全局检查。

`file:`、Git 等来源的标识不一定是 `包名@版本`，必须核对 pnpm 报错列出的完整构建标识，不能直接套用上面的 npm 示例。

保存后回到 Top100 重新预检，核对目标版本和风险，再确认重试。若报错改为其他依赖，单独核对该项。安装成功后按提示重启，并检查插件功能。

pnpm 10 的配置因小版本而异，不能将 pnpm 11 配置直接套用到所有旧版本。参考 [pnpm 10 构建设置](https://github.com/pnpm/pnpm.io/blob/main/versioned_docs/version-10.x/settings.md)；`allowBuilds` 自 10.26.0 起提供。pnpm 11 已移除旧构建授权字段，见 [pnpm 11 官方变更说明](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/11.0.md)。不要为此盲目升级 pnpm 或覆盖原有策略。
