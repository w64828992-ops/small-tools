# small-tools

> Repository Standard: **v1.2.0**

这是所有自制软件、小工具和自动化程序的长期代码资产库。

## 核心原则

- **一个软件 = 一个一级目录**，不预先建立业务分类目录。
- 每个软件都要能做到：看得懂、跑得起来、知道当前版本、知道改过什么、出问题能回退。
- 软件代码、文档、版本记录、测试说明和配置说明要一起维护。
- 核心业务规则、权限规则、接口和异常逻辑必须同时写入代码注释和文档。
- 每次正式更新都要维护版本号和 CHANGELOG。
- 新软件必须按 S0、S1、S2 判断安全级别，不能默认“以后再补安全”。
- 真实密码、Token、API Key、Cookie、私钥等真实凭证不得进入 Git。
- Pull Request 和 main 分支推送自动执行敏感信息扫描。
- 主规则更新后，README、模板、CHANGELOG 和受影响的软件要同步检查。
- 桌面工具必须可从源码重建；安装、窗口生命周期与后台服务生命周期必须明确分离。

## 仓库结构

根目录只保留仓库级文件、规范模板，以及真正的软件目录。

~~~text
small-tools/
├── README.md
├── SECURITY.md
├── CHANGELOG.md
├── .gitignore
├── .github/
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   └── workflows/secret-scan.yml
├── docs/
│   ├── REPO_STANDARD.md
│   └── AUTH_AND_SECRETS_STANDARD.md
├── _templates/
│   ├── TOOL_README_TEMPLATE.md
│   ├── CHANGELOG_TEMPLATE.md
│   ├── DELIVERY_REPORT_TEMPLATE.md
│   ├── SECURITY_CHECKLIST.md
│   └── .env.example
├── software-a/
└── software-b/
~~~

不提前创建“外贸、销售、工厂、供应链”等分类文件夹。开发新软件时，再创建新的一级目录。

## 单个软件最低要求

正式或持续维护的软件原则上至少包含：

~~~text
software-name/
├── README.md
├── CHANGELOG.md
├── VERSION
└── 源代码
~~~

按实际需要增加 `src/`、`tests/`、`docs/`、`examples/`、`.env.example`、依赖文件和部署文件。非常简单的一次性工具可以暂时不建 CHANGELOG；一旦持续维护，必须补齐。

## 安全级别

| 级别 | 场景 | 最低要求 |
|---|---|---|
| S0 | 本地单机、无账号、无外部凭证 | 明确无认证需求；不保存敏感业务数据 |
| S1 | 调用外部 API、数据库或云服务 | 环境变量/密钥服务注入；最小权限；自动秘密扫描 |
| S2 | 多用户、联网、对外服务或含后台管理 | 完整认证授权、Token 生命周期、审计、限流和权限测试 |

认证、授权、凭证和 Token 的完整规则见 [认证与密钥管理规范](docs/AUTH_AND_SECRETS_STANDARD.md)。发现漏洞或凭证泄露时，按 [SECURITY.md](SECURITY.md) 处理。

## 版本规则

采用语义化版本 `MAJOR.MINOR.PATCH`：PATCH 用于修复，MINOR 用于兼容新增，MAJOR 用于不兼容重大变化。开发阶段使用 `0.x.x`，稳定后进入 `1.0.0`。

同一版本的 VERSION、README、CHANGELOG、软件界面和 Git Tag 应保持一致。

## 详细规则

- [仓库开发、版本与归档主规则](docs/REPO_STANDARD.md)：仓库最高规则。
- [认证与密钥管理规范](docs/AUTH_AND_SECRETS_STANDARD.md)：认证、授权、凭证、Token 和日志安全的专项规则。
- [安全事件处理](SECURITY.md)：漏洞、误提交凭证和应急处置。

## 模板

- [工具 README 模板](_templates/TOOL_README_TEMPLATE.md)
- [CHANGELOG 模板](_templates/CHANGELOG_TEMPLATE.md)
- [交付摘要模板](_templates/DELIVERY_REPORT_TEMPLATE.md)
- [安全检查模板](_templates/SECURITY_CHECKLIST.md)
- [环境变量模板](_templates/.env.example)

## 默认开发流程

~~~text
明确需求
→ 判断 S0/S1/S2 安全级别
→ 新建软件一级目录
→ 规划结构与版本
→ 编码并写详细注释
→ 完成认证、授权和凭证处理（适用时）
→ 测试核心、异常和越权场景
→ 更新 README / CHANGELOG / VERSION
→ 执行敏感信息扫描
→ 提交 GitHub
→ 输出交付摘要
~~~

以后所有新软件和后续修改，默认遵守当前主规则。主规则如有更新，必须同步记录并执行。
