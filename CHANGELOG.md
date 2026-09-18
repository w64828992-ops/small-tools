# Changelog

记录 `small-tools` 仓库层面的治理、规则和结构变化。

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
