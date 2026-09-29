# 软件交付摘要

**软件：** drc-control-switch
**版本：** v1.1.0
**Release Standard：** v1.4.0
**Current Compatible Standard：** v1.4.0
**交付日期：** 2026-09-29
**安全级别：** S2
**记录类型：** v1.1.0 发布交付记录

## 本次新增

1. Windows “汇云电脑控制器”。
2. RDC 与 Playwright MCP 双开关。
3. Playwright 开启时强制依赖 RDC。
4. “全部开启”依赖顺序控制。
5. RDC 关闭前先关闭 Playwright。
6. RDC / Playwright 真实状态显示。
7. Playwright 本机 HTTP MCP 服务。
8. Windows 构建、安装、Codex 配置迁移与测试脚本。

## 测试结果

- Windows C# 编译：通过。
- Node 脚本语法：通过。
- Playwright MCP 0.0.82：通过。
- UI 无交互渲染：通过。
- RDC 在线模拟 → Playwright 启动：通过。
- Playwright 关闭 → 8931 端口关闭：通过。
- RDC 离线模拟 → Playwright 禁止启动：通过。
- 真实 RDC live-toggle：未执行，避免切断当前远程链路。
## 安全结果

- Playwright 仅监听 `127.0.0.1:8931`。
- 不保存密码、Token、API Key、Cookie 或私钥。
- 浏览器 Profile 保存在 LocalAppData，仓库不保存。
- 自动测试不主动关闭真实 RDC。
- GitHub Secret Scan / CI：正式归档阶段必须实际产生运行记录并通过。

## Windows 部署目标

```text
C:\Users\Administrator\Desktop\Codex\RemoteDesktopCommander
```

桌面快捷方式：

```text
汇云电脑控制器.lnk
```

Codex Playwright 配置迁移时自动备份原 `config.toml`。

## 已知限制

- Playwright 固定使用本机 8931 端口。
- 默认浏览器通道为 Microsoft Edge。
- 某些已初始化 Codex 会话可能需要重新打开或新建会话才能重新发现刚开启的 MCP 服务。
- 无自动更新机制。

## 回滚

- 源码和正式版本按 Git Tag 回滚。
- Codex 配置可使用 `config.toml.backup-huiyun-*` 恢复。
- 不通过远程会话中的真实 RDC 断开测试验证回滚。
