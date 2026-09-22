# Changelog

记录 `small-tools` 仓库层面的治理、规则和结构变化。

## Repository Standard v1.2.0 - 2026-09-22

### 新增

- 新增桌面可执行工具与后台服务生命周期规则。
- 要求桌面工具保留可复现构建、安装和验证方法。
- 明确窗口生命周期与后台服务生命周期不得默认等同。
- 高风险后台控制的自动测试默认不得主动切断关键连接；live/destructive 测试必须显式 opt-in。
- 新增首个按 v1.2.0 归档的工具 `drc-control-switch`。

### 修改

- 主规则由 v1.1.0 升级为 v1.2.0。
- 根 README、工具 README 模板、交付摘要模板同步增加桌面工具要求。
- 认证与密钥专项规范标记兼容 Repository Standard v1.2.0。

### 原因

- 桌面 App 与后台 LaunchAgent/Service 的生命周期可能不同，仅保存可执行文件或把“关闭窗口”等同于“停止服务”会造成维护和安全风险。
- 需要保证以后换电脑、重新编译或交接时，可以从 GitHub 复现正式版本。

### 生效范围

- 所有新桌面工具立即执行。
- 已有桌面工具在下一次修改时补齐源码、构建、安装、生命周期和验证说明。

---

## Repository Standard v1.1.0 - 2026-09-22

### 新增

- 新增 `docs/AUTH_AND_SECRETS_STANDARD.md`，建立 S0/S1/S2 分级、请求认证、授权、凭证注入、Token 生命周期、日志脱敏和测试规则。
- 新增 `SECURITY.md`，明确漏洞报告和凭证泄露的处置顺序。
- 新增 `_templates/SECURITY_CHECKLIST.md` 与 `_templates/.env.example`。
- 新增 Gitleaks 工作流，对 Pull Request 和 main 推送执行完整历史秘密扫描。
- 新增 Dependabot GitHub Actions 月度更新和 CODEOWNERS。

### 修改

- 主规则由 v1.0.0 升级为 v1.1.0。
- 取消“负责人确认后可提交明文凭证”的例外；真实凭证一律留在 Git 之外。
- 扩展 `.gitignore` 的证书、密钥库、Token 文件和包管理凭证保护。
- README、工具 README 模板和交付摘要模板同步加入安全级别与安全检查。

### 安全影响

- 新增自动检测，但 `.gitignore` 和扫描不能替代凭证轮换、最小权限和 GitHub 仓库设置。
- 如凭证误入历史，必须先撤销或轮换，再清理历史。

### 生效范围

- 所有新软件立即执行 v1.1.0。
- 现有软件在下一次修改时完成安全分级和适配。

---

## Repository Standard v1.0.0 - 2026-09-19

### 新增

- 正式建立 `small-tools` 主规则 v1.0.0。
- 建立“一个软件 = 一个一级目录”的管理方式。
- 建立软件版本号、README、CHANGELOG、代码注释、测试、交付摘要和回滚规则。
- 建立“代码可以上传，真实钥匙默认不上传”的安全规则。
- 新增 `_templates/CHANGELOG_TEMPLATE.md`。
- 新增 `_templates/DELIVERY_REPORT_TEMPLATE.md`。
- 升级工具 README 模板。

### 修改

- 根 README 改为仓库总入口，不再按业务类型预建分类。
- `docs/REPO_STANDARD.md` 成为唯一完整主规则来源。
- 软件目录管理方式由“按业务分类”调整为“每个软件独立一级目录”。
- 以后每个持续维护的软件需维护 `VERSION`、README 和 CHANGELOG。
- 以后核心代码必须写有价值的详细注释，重点解释业务规则和“为什么这样设计”。

### 删除

- 删除预先创建的业务分类目录：
  - `foreign-trade/`
  - `sales/`
  - `alibaba-international/`
  - `factory/`
  - `supply-chain/`
  - `management/`
  - `data-tools/`
  - `office-tools/`
  - `shared/`

### 生效范围

- 所有后续新建软件立即遵循 v1.0.0。
- 以后修改已有软件时，应同步检查是否符合当前主规则。
- 主规则未来升级时，需要同步检查 README、模板、CHANGELOG 和受影响软件。

---

## 2026-09-19 - Initial setup

### Added

- 初始化 `small-tools` 仓库。
- 增加基础 README、开发规范、README 模板和 `.gitignore`。
- 初期曾建立业务分类目录，随后在主规则 v1.0.0 中正式取消。
