# Windows + RDC 统一开发工作流

本文件定义 Windows 开发机通过 RDC、ChatGPT、Codex 开发 `small-tools` 时的本地执行方式。仓库最高规则仍为 [REPO_STANDARD.md](REPO_STANDARD.md)。

## 固定路径

- Repository：`w64828992-ops/small-tools`
- Windows 本地仓库：`D:\Dev\small-tools`
- 环境变量：`SMALL_TOOLS_HOME=D:\Dev\small-tools`
- 通用命令目录：`C:\DevTools\bin`

不要在桌面、下载目录或临时目录建立同一仓库的长期开发副本。

## 三个标准入口

### 1. 环境检查

```powershell
pwsh -File scripts\repo-health.ps1
```

或直接执行：`st-health`。

用于确认 Git、GitHub CLI、Codex、Playwright MCP、Gitleaks 和仓库状态。

### 2. 开始开发

```powershell
pwsh -File scripts\start-work.ps1 -Type feat -SoftwareName quotation-tool -ShortDescription add-export
```

脚本会自动检查工作区、拉取最新 `main`，并按 Repository Standard 建立临时开发分支。禁止长期直接在 `main` 上开发。

### 3. 开发完成并归档

```powershell
pwsh -File scripts\finish-work.ps1 -SoftwareName quotation-tool -CommitType feat -Message "add export" -TestCommand "python -m pytest" -CreateTag
```

脚本自动执行：测试 → git add → 本地 Gitleaks → Commit → Push 临时分支 → 创建 PR → 等待并确认 GitHub Secret Scan / CI → 合并 main → 同步 `tool/<software-name>` → 可选创建正式 Tag → 删除临时分支 → 输出交付摘要。

## 安全保护

以下情况自动停止，不继续归档：

- 当前在 `main` 或 `tool/*` 上直接开发；
- 本地敏感信息扫描失败；
- GitHub Secret Scan / CI 未产生可验证运行记录或失败；
- `tool/*` 与 `main` 出现无法安全快进的分叉；
- Tag 已存在但指向不同 Commit；
- GitHub 未登录或权限不足；
- 缺少必须的 README / CHANGELOG / VERSION。

## 测试规则

`finish-work.ps1` 会优先寻找以下测试入口：

- `tests/smoke-test.ps1`
- `tests/smoke-test.cmd`
- `tests/smoke-test.bat`
- `tests/smoke-test.sh`
- `scripts/test.ps1`
- `scripts/test.cmd`

也可以通过 `-TestCommand` 指定测试命令。

只有已经完成明确人工验证、并且交付摘要会记录限制时，才允许显式使用 `-SkipTests`。

## AI / Codex / RDC 默认行为

后续在这台 Windows 上开发小工具时，默认：

1. 先读取 `AGENTS.md` 和 `docs/REPO_STANDARD.md`。
2. 以 `D:\Dev\small-tools` 为唯一工作仓库。
3. 用 `start-work.ps1` 建分支。
4. 开发和测试完成后用 `finish-work.ps1` 归档。
5. 归档流程成功前，不把任务表述为“已完成”。
