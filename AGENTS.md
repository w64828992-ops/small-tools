# AGENTS.md

本文件用于约束在本仓库工作的 ChatGPT、Codex、RDC 开发代理和其他 AI / 自动化开发工具。

## 最高规则

1. 开始任何开发前，必须先读取 `docs/REPO_STANDARD.md`。
2. 如本文件与 `docs/REPO_STANDARD.md` 冲突，以 `docs/REPO_STANDARD.md` 为准。
3. 当前目标仓库固定为：`w64828992-ops/small-tools`。
4. 一个小工具一个一级目录，目录名使用英文小写 + 连字符。
5. 真实密码、Token、API Key、Cookie、私钥和未脱敏敏感业务数据不得提交 Git。
6. Windows + RDC 标准开发机以 `D:\Dev\small-tools` 为唯一长期工作仓库；标准入口见 `docs/WINDOWS_RDC_DEV_WORKFLOW.md` 和根目录 `scripts/`。

## 默认开发流程

负责人只需要提出开发或修改需求，不需要重复提醒 GitHub 上传。

完成代码后，代理必须继续执行：

```text
读取当前规则和工具状态
→ 从最新 main 创建临时分支
→ 开发 / 修改
→ 测试
→ 更新 README / CHANGELOG / VERSION
→ 判断 S0 / S1 / S2
→ 本地敏感信息检查
→ 推送临时分支
→ 创建 PR
→ 确认 Secret Scan / CI 实际运行并通过
→ 合并 main
→ 同步 tool/<software-name>
→ 创建/核对正式 Tag（适用时）
→ 清理已合并临时分支（权限支持时）
→ 输出交付摘要
```

## 禁止事项

- 不得因为“代码已能运行”就停止在本地。
- 不得长期直接在 `main` 上开发。
- 不得把“存在 workflow 文件”写成“Secret Scan 已通过”。
- 不得为了测试切断当前远程控制链路，除非有独立恢复通道且负责人明确确认。
- 不得未经确认改变核心经营规则、权限规则、计算口径或真实业务结果。
- 不得强制覆盖历史、重写 Tag、删除重要分支或执行其他不可逆 Git 操作。

## 必须暂停确认的情况

出现以下任一情况时，停止自动归档并向负责人说明：

- 核心经营规则需要改变；
- 发现或怀疑存在真实凭证、敏感数据；
- 测试或 Secret Scan / CI 失败；
- 合并冲突无法安全自动解决；
- 需要不可逆 Git 操作；
- GitHub 权限或连接不足。

## 交付状态

只有当 GitHub 归档关键步骤完成后才能标记“已完成”。

交付摘要必须至少包含：

- 软件名与版本
- Repository
- 开发分支
- Commit SHA
- PR 编号
- Secret Scan / CI 状态
- main 合并状态
- tool 分支同步状态
- Tag
- 临时分支清理状态
- 未覆盖测试和已知限制
