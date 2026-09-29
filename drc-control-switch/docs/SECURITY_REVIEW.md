# DRC / Playwright 控制开关安全审查

**Version:** v1.1.0
**Security Level:** S2
**Review Date:** 2026-09-29
**Repository Standard:** v1.4.0

## 1. S2 判定

本工具本身是本地单用户桌面工具，但可以改变两类高权限能力：

1. Desktop Commander Remote 远程控制通道。
2. Playwright 浏览器自动化通道。

因此按 S2 管理，不能把“本地小工具”当作低风险普通程序。

## 2. 权限边界

### macOS v1.0.0

只操作当前用户 GUI Domain 的 `com.desktopcommander.remote` LaunchAgent，不使用 sudo。

### Windows v1.1.0

- RDC 认证、设备授权和云端 Token 继续由 Desktop Commander 官方组件负责。
- Playwright MCP 只绑定 `127.0.0.1:8931`。
- 不绑定 `0.0.0.0`，不向局域网或公网暴露 MCP 服务。
- 控制器不提升为管理员权限，不修改防火墙或系统 Service。
## 3. 核心安全约束

Windows 版强制执行：

```text
Playwright 运行 => RDC 实际在线
```

Playwright 后台会持续读取 RDC 实际状态。RDC 未在线时：

- Playwright 不启动；
- 已运行的 Playwright 会停止；
- 状态显示“等待 RDC 连接”。

关闭 RDC 时，UI 先请求关闭 Playwright，再关闭 RDC。

该约束同时存在于 UI 和后台服务层，避免只靠界面按钮状态。

## 4. 凭证与本地数据

本工具源码和配置不保存：

- 密码；
- API Key；
- Access Token / Refresh Token；
- Cookie；
- 私钥；
- GitHub Token；
- Desktop Commander 认证令牌。

Playwright 浏览器 Profile 存放于：

```text
%LOCALAPPDATA%\HuiyunComputerController\playwright-profile
```

该目录位于仓库之外，不提交 Git。
## 5. 状态与日志

界面状态必须来自实际系统状态，不信任上一次按钮点击。

Windows：

- RDC：读取 `status.json` 的新鲜状态。
- Playwright：读取 `playwright_status.json`，并检查 8931 TCP 端口。
- RDC / Playwright 日志不得主动写入认证凭证。

## 6. 高风险操作与测试

高风险动作：

1. 真正关闭 RDC，可能切断当前远程维护链路。
2. 启动 Playwright，会获得当前用户浏览器自动化能力。

控制原则：

- 打开 UI 不自动改变服务状态。
- 关闭 UI 不改变后台服务状态。
- 真 RDC 断开 / 重连测试在远程会话中默认禁止。
- 可以安全测试 Playwright 自己的开 / 关，同时确认 RDC 始终保持在线。
- smoke test 只做编译、语法、依赖和 UI 渲染，不切 RDC。

## 7. 已验证

- [x] Windows C# 编译。
- [x] Node 脚本语法。
- [x] Playwright MCP 依赖版本。
- [x] UI 无交互渲染。
- [x] RDC 在线时 Playwright 能启动。
- [x] Playwright 关闭后 8931 端口关闭。
- [x] RDC 离线模拟时 Playwright 不启动。
- [x] 测试过程未主动断开真实 RDC。
## 8. 已知风险与限制

- 本工具控制的是高权限能力；已经登录当前 Windows 账号的恶意用户，本身也可能启动相同程序，本工具不提供额外 OS 级身份隔离。
- Playwright 服务虽然只监听 localhost，但运行后具备浏览器自动化权限，因此不用时应保持关闭。
- Playwright 浏览器 Profile 可能包含登录会话数据，应按本机用户权限保护，不应复制到 Git 或公共位置。
- Desktop Commander 或 Playwright MCP 若改变启动参数、协议或认证方式，需要重新安全审查。
- 当前没有自动更新机制。

## 9. 回滚

如 v1.1.0 出现问题：

1. 使用 `drc-control-switch-v1.0.0` 或上一稳定 Commit 恢复源码。
2. Windows Codex 配置使用迁移脚本生成的 `config.toml.backup-huiyun-*` 恢复。
3. 不在远程会话中通过破坏性测试验证 RDC 断开。
