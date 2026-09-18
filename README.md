# small-tools

统一存放和维护各类业务小工具的代码仓库。

## 仓库目标

- 所有小工具统一归档、分类、版本化和备份。
- 每个工具必须有清晰说明，做到“别人能接手，半年后自己也能继续维护”。
- 优先服务真实业务场景：外贸、销售、阿里国际站、工厂、供应链、经营管理、数据处理和办公效率。

## 分类目录

| 目录 | 用途 |
|---|---|
| `foreign-trade/` | 外贸、B2B、客户开发、报价、跟进等工具 |
| `sales/` | 销售管理、CRM 辅助、成交分析等工具 |
| `alibaba-international/` | 阿里国际站运营、关键词、询盘、数据分析等工具 |
| `factory/` | 生产、排产、品质、交期、工艺等工具 |
| `supply-chain/` | 采购、供应商、库存、交付协同等工具 |
| `management/` | 经营分析、团队管理、流程、绩效等工具 |
| `data-tools/` | 数据清洗、转换、分析、报表等通用工具 |
| `office-tools/` | 文档、表格、文件、日常办公效率工具 |
| `shared/` | 多个工具共用的组件、函数和配置 |
| `_templates/` | 新工具模板 |
| `docs/` | 仓库规范和公共文档 |

## 每个工具的最低标准

每个工具使用独立目录，并至少包含：

```text
tool-name/
├── README.md
├── src/
└── examples/        # 有示例时保留
```

README 至少说明：

1. 解决什么业务问题
2. 适用场景与不适用场景
3. 如何运行
4. 输入与输出
5. 依赖和环境要求
6. 注意事项与已知限制
7. 版本变化

## 命名规范

- 文件夹：英文小写 + 连字符，例如 `quote-profit-calculator`
- 不使用“最终版”“最新版”“new2”等名称
- 一个工具只解决一类核心问题，复杂功能拆模块

## Git 提交规范

推荐使用：

- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `refactor:` 重构
- `test:` 测试
- `chore:` 仓库维护

示例：

```text
feat: add quotation profit calculator
fix: correct freight allocation logic
docs: update usage guide
```

## 默认工作方式

以后新增工具时，默认执行以下流程：

1. 判断所属分类。
2. 创建独立工具目录。
3. 编写或更新 README。
4. 完成代码与必要测试。
5. 提交到仓库并留下清晰提交记录。
6. 重要变化同步更新说明或 CHANGELOG。

详细规范见 [docs/REPO_STANDARD.md](docs/REPO_STANDARD.md)。
