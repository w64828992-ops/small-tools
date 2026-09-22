# 软件交付摘要

**软件：** drc-control-switch  
**版本：** v1.0.0  
**Release Standard：** v1.2.0  
**Current Compatible Standard：** v1.3.0  
**交付日期：** 2026-09-22  
**状态：** 已完成

## 本次新增

1. 香蕉图标 macOS 控制面板。
2. 显示真实 DRC 连接状态。
3. 单一开关连接 / 断开。
4. 关闭窗口不改变后台连接。
5. 可复现构建和桌面安装。
6. 安全 smoke test。
7. S2 安全审查。

## 测试结果

- Swift 编译：通过。
- App Bundle / plist / codesign：通过。
- 香蕉图标：通过。
- UI“连接成功”读取：通过。
- v1.0.0 UI 版本号：通过。
- 临时 LaunchAgent 开关模拟：通过。
- 关闭控制面板后真实 DRC 保持连接：通过。
- 真实 DRC Ping：通过。
- 真 DRC live-toggle：未在当前远程会话执行，避免主动切断控制链路；脚本提供显式 opt-in。

## 文档状态

- [x] README
- [x] CHANGELOG
- [x] VERSION
- [x] 核心代码说明
- [x] 安全审查
- [x] 回滚说明

## 安全检查

- **安全级别：** S2
- [x] 不保存密码、Token、API Key、Cookie 或私钥
- [x] 不使用 sudo
- [x] 默认测试不真实断开 DRC
- [x] 真实业务数据：无
- [x] 安全边界已记录

## 回滚

恢复任一稳定 Tag / Commit 后重新执行：

```bash
./scripts/build.sh
./scripts/install-desktop.sh
```

安装过程不会主动改变 DRC 当前连接状态。

## 已知限制

- 依赖固定 LaunchAgent Label 与 plist 路径。
- 仅支持 macOS。
- 无自动更新机制。


## 分支治理复核

- 正式源：`main`
- 稳定入口：`tool/drc-control-switch`
- Release Standard：v1.2.0
- Current Compatible Standard：v1.3.0
- 旧临时分支：应在合并后删除；如当前工具权限无法物理删除，必须保持与 `main` 同步并明确记录待清理。
