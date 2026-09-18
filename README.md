# small-tools

> Repository Standard: **v1.0.0**

这是所有自制软件、小工具和自动化程序的长期代码资产库。

## 核心原则

- **一个软件 = 一个一级目录**，不预先建立业务分类目录。
- 每个软件都要能做到：看得懂、跑得起来、知道当前版本、知道改过什么、出问题能回退。
- 软件代码、文档、版本记录、测试说明和配置说明要一起维护。
- 代码必须有有价值的详细注释，尤其是核心业务规则、金额、利润、成本、报价、交期、库存、接口和异常逻辑。
- 业务规则不能只写在代码里，必须同步写入 README 或 docs。
- 每次正式更新都要维护版本号和 CHANGELOG。
- 代码可以进入 GitHub；真实密码、Token、API Key、私钥等“真实钥匙”默认不进入 Git。
- 主规则更新后，README、模板、CHANGELOG 和受影响的软件要同步检查。

## 仓库结构

根目录只保留仓库级文件、规范模板，以及真正的软件目录。

```text
small-tools/
├── README.md
├── CHANGELOG.md
├── .gitignore
├── docs/
│   └── REPO_STANDARD.md
├── _templates/
│   ├── TOOL_README_TEMPLATE.md
│   ├── CHANGELOG_TEMPLATE.md
│   └── DELIVERY_REPORT_TEMPLATE.md
│
├── software-a/
├── software-b/
└── software-c/
```

不提前创建“外贸、销售、工厂、供应链”等分类文件夹。需要开发一个新软件时，再创建一个新的一级目录。

## 单个软件最低要求

正式或持续维护的软件原则上至少包含：

```text
software-name/
├── README.md
├── CHANGELOG.md
├── VERSION
└── 源代码
```

按实际需要增加：

```text
src/
tests/
docs/
examples/
.env.example
requirements.txt
package.json
```

非常简单的一次性工具可以暂时不建 CHANGELOG；一旦进入持续维护，必须补齐。

## 版本规则

采用语义化版本：

```text
MAJOR.MINOR.PATCH
```

- PATCH：Bug 修复、小调整。
- MINOR：新增兼容功能。
- MAJOR：重大改版、接口或核心逻辑发生不兼容变化。
- 开发阶段使用 `0.x.x`，稳定使用后进入 `1.0.0`。

同一版本的 `VERSION`、README、CHANGELOG、软件界面和 Git Tag 应保持一致。

## 详细规则

完整规则以 [docs/REPO_STANDARD.md](docs/REPO_STANDARD.md) 为唯一权威来源。

## 模板

- [工具 README 模板](_templates/TOOL_README_TEMPLATE.md)
- [CHANGELOG 模板](_templates/CHANGELOG_TEMPLATE.md)
- [交付摘要模板](_templates/DELIVERY_REPORT_TEMPLATE.md)

## 默认开发流程

```text
明确需求
→ 新建软件一级目录
→ 规划结构与版本
→ 编码并写详细注释
→ 测试核心和异常场景
→ 更新 README
→ 更新 CHANGELOG
→ 检查 VERSION
→ 检查敏感信息
→ 提交 GitHub
→ 输出交付摘要
```

以后所有新软件和后续修改，默认遵守当前主规则。主规则如有更新，必须同步记录并执行。
