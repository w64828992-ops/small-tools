# DRC 控制开关

**Current Version:** v1.0.0  
**Release Standard:** v1.2.0  
**Current Compatible Standard:** v1.4.0  
**Status:** 已完成  
**Security Level:** S2（涉及远程访问开关，但本工具本身不保存认证凭证）

## 1. 软件用途

macOS 本地小工具，用一个香蕉图标的控制面板管理 Desktop Commander Remote（DRC）后台连接。

核心目标：不用每次打开终端输入命令，也不用维护“启动”和“停止”两个独立脚本。

## 2. 使用对象

- 需要让 ChatGPT 通过 Desktop Commander 操作本机的负责人。
- 需要明确知道当前 DRC 是连接还是断开的 macOS 用户。

## 3. 核心功能

1. 打开 App 后读取真实 LaunchAgent 状态。
2. 显示“连接成功”或“连接失败”。
3. 通过一个开关连接 / 断开 DRC。
4. 关闭控制面板窗口时，只退出面板，不改变后台连接。
5. 再次打开时重新读取真实状态，不依赖上次 UI 状态。
6. 显示软件版本号，便于排错和版本核对。
7. App 使用香蕉图标；图标由构建脚本生成，不需要提交二进制图标文件。

## 4. 核心规则

### 4.1 连接状态

DRC LaunchAgent 标识固定为：

```text
com.desktopcommander.remote
```

状态检测：

```text
launchctl print gui/<uid>/com.desktopcommander.remote
```

仅当命令成功且状态包含 `state = running` 时，界面显示“连接成功”。

### 4.2 连接

如果 LaunchAgent 已加载：使用 `launchctl kickstart`。

如果未加载：依次执行 `bootstrap → enable → kickstart`。

依赖配置文件：

```text
~/Library/LaunchAgents/com.desktopcommander.remote.plist
```

如果该文件不存在，连接失败，不自动创建、不猜测配置。

### 4.3 断开

用户主动关闭开关时，执行：

```text
launchctl bootout gui/<uid>/com.desktopcommander.remote
```

### 4.4 窗口生命周期

**关闭 App 窗口 ≠ 断开 DRC。**

只有用户主动点击控制面板开关，才允许改变后台连接状态。这是本工具最重要的产品规则之一，修改时必须同步测试。

## 5. 不适用场景

- Desktop Commander 尚未安装或未创建对应 LaunchAgent。
- Windows / Linux。
- 需要修改 Desktop Commander 账号、Token、服务端权限的场景。
- 需要远程自动强制重连但本机无人确认的场景。

## 6. 环境与依赖

- macOS 15 或兼容版本。
- Swift / `swiftc`。
- AppKit。
- 系统命令：`launchctl`、`sips`、`iconutil`、`codesign`。
- 已存在 Desktop Commander Remote LaunchAgent。

无第三方 Swift 包，无 Homebrew 依赖。

## 7. 文件结构

```text
drc-control-switch/
├── README.md
├── CHANGELOG.md
├── VERSION
├── src/
│   └── main.swift
├── scripts/
│   ├── build.sh
│   └── install-desktop.sh
├── tests/
│   └── smoke-test.sh
└── docs/
    ├── DELIVERY_REPORT.md
    └── SECURITY_REVIEW.md
```

## 8. 构建

在仓库根目录执行：

```bash
cd drc-control-switch
chmod +x scripts/*.sh tests/*.sh
./scripts/build.sh
```

构建产物：

```text
dist/DRC控制开关.app
```

构建脚本会：

1. 编译 Swift。
2. 生成 App Bundle。
3. 生成香蕉 `.icns` 图标。
4. 写入 Info.plist。
5. 使用 ad-hoc 签名完成本机可运行签名。
6. 校验 plist 与 codesign。

## 9. 安装到桌面

```bash
./scripts/install-desktop.sh
```

目标位置：

```text
~/Desktop/DRC控制开关.app
```

安装脚本不会自动开启或关闭 DRC。

## 10. 测试

默认安全测试：

```bash
./tests/smoke-test.sh
```

默认测试不会主动断开真实 DRC，重点检查：

- Swift 编译。
- App Bundle / plist / 签名。
- LaunchAgent 配置是否存在。
- 当前真实连接状态读取。
- 关闭控制面板不会改变后台 DRC 状态。

如确需测试真实“连接 / 断开”完整流程，必须显式设置：

```bash
DRC_ALLOW_LIVE_TOGGLE_TEST=1 ./tests/smoke-test.sh
```

**警告：live-toggle 会真实断开并恢复 DRC，远程会话中不要随意执行。**

## 11. 安全与权限

安全级别：**S2**，原因是本工具可以改变远程访问能力。

但本工具本身：

- 不保存账号。
- 不保存密码。
- 不保存 API Key / Token / Cookie / 私钥。
- 不实现 Desktop Commander 的身份认证。
- 不上传本机信息。
- 不写包含凭证的日志。

远程身份、设备授权与 Token 生命周期由 Desktop Commander 自身负责。

本工具只调用当前登录用户域中的 `launchctl`，不使用 `sudo`。

## 12. 已验证结果

2026-09-22 在目标 Mac 实测：

- App 编译：通过。
- App 签名：通过。
- 香蕉图标生成：通过。
- 当前连接状态读取：通过。
- 界面显示“连接成功”：通过。
- 临时 LaunchAgent 的连接 / 断开模拟：通过。
- 关闭面板后 DRC 保持连接：通过。
- 当前 DRC Ping：通过。
- UI 版本号 v1.0.0：通过。

## 13. 已知限制

- 当前依赖固定 Label：`com.desktopcommander.remote`。
- 当前只支持当前 macOS 用户的 GUI LaunchAgent。
- 如果 Desktop Commander 将来修改 Label、plist 路径或启动方式，需要同步升级。
- 当前没有自动更新机制。

## 14. 回滚

v1.0.0 为首个稳定版。

后续版本出现问题时：

1. 使用 Git Tag 或历史 Commit 恢复上一稳定源码。
2. 重新执行 `scripts/build.sh`。
3. 重新执行 `scripts/install-desktop.sh`。
4. 安装过程不会主动改变 DRC 当前连接状态。

## 15. 版本记录

完整记录见 [CHANGELOG.md](CHANGELOG.md)。

当前版本以 `VERSION` 为准。


## 16. Git 分支与版本定位

- **正式代码源：** `main`
- **长期稳定入口：** `tool/drc-control-switch`
- **发布版本：** v1.0.0
- **Release Standard：** v1.2.0
- **Current Compatible Standard：** v1.4.0
- **版本 Tag：** 建议使用 `drc-control-switch-v1.0.0`

历史发布事实以 Release Standard 为准；后续规范兼容检查以 Current Compatible Standard 为准。

2026-09-24 已复核 Repository Standard v1.4.0 的自动归档要求；本次仅更新规范兼容记录，不改变 DRC 控制开关 v1.0.0 的功能、源码和发布版本。
