# 1.3.5 兼容与发布说明

状态：2026-09-11 已发布 npm/GitHub 1.3.5，并完成官网与重点榜单部署。npm 1.3.4 已标为 deprecated，提示升级到 1.3.5。

本版针对 DSH Web 0.1.5-rc.2 更新依赖声明与验证基线。Settings 的旧自由函数在宿主0.1.2起已改为服务方法；插件现在兼容两个入口，避免可选设置模块因缺少导出而失效。客户端信息依赖指向真实的界面、语言和设置服务。

开发依赖固定为0.1.5-rc.2；peer显式列出原0.1.1、已测0.1.2及本次0.1.5的预发布范围。保留旧范围不代表对所有历史版本重新验收。官方宿主源码声明Node `^22.19.0 || >=24.0.0`，当前安装建议Node24 LTS；插件自身的引擎声明不替代宿主要求。

当前环境：macOS、Node24.20.0、pnpm11.24.0、官方npm DSH0.1.5-rc.2，HOME/DSH_HOME/Profile全部隔离且没有模型凭证。已通过官方CLI安装与包文件核对、插件加载、Settings注册和地址即时切换、非法地址拒绝、推荐Skill/工具注册及无模型只读搜索、浏览器榜单/搜索/诊断/更新取消。自有无生命周期脚本fixture通过禁用/启用、更新、重复更新拒绝、卸载及重启后的真实路由检查，未选插件保持原版本与文件hash；冻结锁文件安装退出0。

自动检查：类型检查及1,467项测试通过，依赖审计0漏洞，新增6项真实SettingsProvider生命周期回归。浏览器错误日志0。`pnpm peers check`对Profile缺少直接peer声明返回1：宿主由inbox回退提供这些包，真实加载和诊断通过；没有为消除这项静态检查而向Profile重复安装宿主。

验证不包含Windows或DSH Desktop实测，Desktop仍走既有desktopPnpm服务分支；未安装公开第三方插件，未运行任何模型对话。

重点榜单修复覆盖热榜、新锐榜和Stars前100；其中追加纠正mrRisega/dsh-remote旧别名包的维护提示简介与否定句引发的错类。长尾缺项另批处理。33项定向来源复核中31项完善、2项根据明确确认排除，并按既有排序补位。每日仍正常采集与计算排名，日常付费内容生成保持关闭。获准30条Flash试跑产生独立候选，没有合入生产目录。

官方依据：[DSH rc.2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)、[固定版本Settings接口](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/settings/settings/src/index.ts)。

公开 npm 包与 GitHub 附件均匹配已验收的81文件归档；发布代码提交为 `c94355149ff0ac35a859429786f00e1965dd0856`。官网页面和安装指南通过公网逐字节核对，快照 `2026-09-11-7248421e14b93ee9` 的热榜、新锐榜、Stars前100及Skills资源hash与验收产物一致。历史254605行、预算账本及其他服务保持。
