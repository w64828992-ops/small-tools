# DRC / Playwright 控制开关

**Current Version:** v1.1.2
**Release Standard:** v1.4.0
**Current Compatible Standard:** v1.4.0
**Security Level:** S2（可控制远程访问与浏览器自动化能力）

## 1. 软件用途

本工具用于统一管理 Desktop Commander Remote（RDC）连接能力。

- macOS v1.0.0：DRC 单开关控制面板。
- Windows v1.1.0：升级为“汇云电脑控制器”，统一管理 RDC + Playwright MCP。

Windows 版重点解决两个问题：

1. 用户不需要再通过终端手动启动、停止 RDC 或 Playwright。
2. Playwright 必须依赖 RDC：**Playwright 开启时，RDC 一定处于开启状态。**

## 2. Windows v1.1.x 核心规则

1. RDC 可以单独开启、关闭。
2. 开启 Playwright 时，如 RDC 未开启，先开启 RDC。
3. Playwright 后台只在检测到 RDC 实际在线后启动。
4. 关闭 Playwright 只关闭 Playwright，RDC 保持不变。
5. Playwright 已开启时关闭 RDC，控制器先关闭 Playwright，再关闭 RDC。
6. “全部开启”按 RDC → Playwright 的依赖顺序执行。
7. 关闭控制器窗口不会关闭后台服务。
8. 界面状态读取实际状态文件、进程与端口，不以按钮点击结果冒充成功。
9. Playwright 管理进程常驻但浏览器控制子进程可关闭；重新开启时等待旧端口完全释放后立即拉起，不再触发 5 秒退避。当前 Windows 开发机实测由约 7.2 秒降至约 1.4 秒。
## 3. Windows 状态与服务

Windows 正式安装目录：

```text
C:\Users\Administrator\Desktop\Codex\RemoteDesktopCommander
```

桌面入口：

```text
汇云电脑控制器.lnk
```

RDC 状态文件：

```text
status.json
desired.txt
```

Playwright 状态文件：

```text
playwright_status.json
playwright_desired.txt
```

Playwright MCP 仅监听本机：

```text
http://127.0.0.1:8931/mcp
```

不会绑定到局域网或公网地址。

## 4. Playwright 依赖保护

`playwright-background.mjs` 在服务层再次校验 RDC，而不是只依赖 UI：

- `status.json` 必须是新鲜状态；
- `enabled === true`；
- `online === true`。

任一条件不满足，Playwright 不启动；已经运行时会停止。

因此核心约束为：

```text
Playwright 运行 => RDC 实际在线
```
## 5. Windows 构建

固定开发仓库：

```text
D:\Dev\small-tools
```

构建：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\build.ps1
```

构建产物：

```text
windows\dist\windows\HuiyunComputerController.exe
```

Windows 运行依赖：

- Windows 10/11 x64
- .NET Framework 4.x C# 编译器
- Node.js
- `@wonderwhy-er/desktop-commander 0.2.51`
- `@playwright/mcp 0.0.82`
- Microsoft Edge

依赖版本由 `package-lock.json` 锁定。

## 6. Windows 安装与 Codex 配置

安装桌面版：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\install-desktop.ps1
```

升级安装会同步正式构建中打包的 Node 依赖，即使目标目录已经存在 `node_modules`，也会补齐/覆盖当前版本需要的依赖；不会因为升级而主动关闭 RDC 后台连接。

将 Codex 的 Playwright MCP 改为本机 HTTP 服务：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\scripts\configure-codex-playwright.ps1
```

配置脚本会先备份 `~\.codex\config.toml`，验证失败会恢复原文件。
## 7. 测试

Windows 安全 smoke test：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File windows\tests\smoke-test.ps1
```

默认测试覆盖：

- C# 界面编译；
- Node 脚本语法；
- Playwright MCP 版本与依赖；
- UI 无交互渲染；
- 不主动断开真实 RDC。

另外应执行 Playwright 依赖模拟测试：

- RDC 在线 → Playwright 能启动；
- Playwright 关闭 → 8931 端口关闭；
- RDC 离线 → Playwright 不允许启动。

**真实 RDC 断开 / 重连不在远程开发会话中自动执行。**

## 8. macOS v1.0.0

macOS 版本继续保留 `src/main.swift`、`scripts/build.sh`、`scripts/install-desktop.sh` 和 `tests/smoke-test.sh`。

核心 LaunchAgent：

```text
com.desktopcommander.remote
```

macOS 规则仍为：关闭 App 窗口不等于断开 DRC；只有主动操作开关才改变后台状态。
## 9. 安全与凭证

安全级别：**S2**。

仓库与控制器本身不保存：

- 密码；
- API Key；
- Access / Refresh Token；
- Cookie；
- 私钥；
- GitHub Token；
- Desktop Commander 认证令牌。

Windows Playwright 服务只监听 `127.0.0.1`，浏览器配置文件存放在用户本机 LocalAppData，不进入 Git。

## 10. 已知限制

- 当前 Windows Playwright 端口固定为 8931。
- 当前浏览器通道固定为 Microsoft Edge。
- Codex 在某个会话初始化时如果 Playwright 服务处于关闭状态，客户端是否能在同一会话内自动重新发现服务取决于当前 Codex 行为；必要时重新打开/新建 Codex 会话。
- Windows 版不做“远程会话中主动断开真实 RDC 再自恢复”的自动测试。
- 无自动更新机制。

## 11. 回滚

正式版本通过 Git Tag 定位：

```text
drc-control-switch-v1.0.0
drc-control-switch-v1.1.0
drc-control-switch-v1.1.1
drc-control-switch-v1.1.2
```

Windows 配置迁移前会生成 Codex 配置备份；出现问题时可恢复备份，并重新部署上一稳定 Tag。

## 12. Git 分支与版本定位

- 正式代码源：`main`
- 长期稳定入口：`tool/drc-control-switch`
- 当前版本：v1.1.2
- Release Standard：v1.4.0
- Current Compatible Standard：v1.4.0
- 正式 Tag：`drc-control-switch-v1.1.2`
