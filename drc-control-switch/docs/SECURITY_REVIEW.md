# DRC 控制开关安全审查

**Version:** v1.0.0  
**Security Level:** S2  
**Review Date:** 2026-09-22

## 1. 为什么是 S2

本工具本身是本地单用户 App，但它可以开启或关闭远程控制通道，因此按仓库规则使用更高等级 **S2** 管理。

## 2. 权限边界

本工具只操作当前登录用户 GUI Domain 下的：

```text
com.desktopcommander.remote
```

使用：

- `launchctl print`
- `launchctl bootstrap`
- `launchctl enable`
- `launchctl kickstart`
- `launchctl bootout`

不调用 `sudo`，不修改系统级 LaunchDaemon。

## 3. 凭证

本工具不读取、不保存、不传输：

- 密码
- API Key
- Access Token
- Refresh Token
- Cookie
- 私钥
- GitHub Token
- Desktop Commander 认证信息

远程身份认证属于 Desktop Commander 自身职责。

## 4. 高风险操作

高风险动作只有两个：

1. 开启 DRC 后台连接。
2. 断开 DRC 后台连接。

控制原则：

- UI 启动时只读状态，不自动改变。
- 关闭窗口不改变状态。
- 只有用户主动操作开关才改变状态。
- 自动测试默认禁止真实断开。
- live-toggle 测试必须显式设置环境变量。

## 5. 失败策略

- 找不到 LaunchAgent plist：连接失败，不自动创建配置。
- launchctl 执行失败：显示失败，并重新读取真实状态。
- 状态以系统 `launchctl` 为准，不信任 UI 缓存。
- 不因异常自动放开远程访问。

## 6. 数据与日志

当前版本：

- 无业务数据。
- 无数据库。
- 无网络请求。
- 无持久日志。
- 无凭证日志。

## 7. 已测试

- [x] plist / App 签名。
- [x] 真实连接状态读取。
- [x] 临时 LaunchAgent 连接 / 断开模拟。
- [x] 关闭面板不改变 DRC 连接。
- [x] 真实 DRC Ping。
- [x] 默认 smoke test 不主动断开真实 DRC。
- [x] 仓库代码无真实凭证。

## 8. 已知风险

如果恶意用户已经能够登录当前 macOS 账号，其本身可能执行 launchctl；本工具不会扩大到 root 权限。

如 Desktop Commander 后续改变认证方式、Label 或 plist 路径，需要重新评估本工具。
