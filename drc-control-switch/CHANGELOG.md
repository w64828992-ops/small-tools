# Changelog

## v1.0.0 - 2026-09-22

### 新增

- 新增 macOS 原生 DRC 控制面板。
- 新增真实连接状态检测。
- 新增单开关连接 / 断开。
- 新增“关闭窗口不改变后台连接”的生命周期规则。
- 新增香蕉图标。
- 新增界面版本号显示。
- 新增可复现构建脚本、桌面安装脚本和 smoke test。
- 新增 S2 安全审查与交付记录。

### 修改

- 将原先分离的“启动 App / 停止 App”方式合并为单一控制面板。

### 修复

- 避免用户仅关闭控制面板时误断开 DRC。
- 避免重复启动后台服务。

### 影响范围

- macOS 本机 Desktop Commander Remote 的启动状态控制。

### 数据影响

- 无业务数据写入。
- 无数据库。
- 无历史数据迁移。

### 兼容性

- 依赖 `com.desktopcommander.remote` LaunchAgent。
- 依赖 `~/Library/LaunchAgents/com.desktopcommander.remote.plist`。

### 测试

已覆盖：

- 编译。
- App Bundle / plist / 签名。
- UI 状态显示。
- 临时 LaunchAgent 开 / 关模拟。
- 控制面板退出后后台连接保持。
- 当前真实 DRC Ping。

未自动覆盖：

- 在远程会话中真实执行 DRC 断开后，再由同一远程会话验证恢复。该测试会主动切断控制链路，默认不执行。

### 注意事项

- live-toggle 测试必须明确设置 `DRC_ALLOW_LIVE_TOGGLE_TEST=1`。
- 修改 LaunchAgent Label、路径或生命周期逻辑必须升级版本并同步 README / 测试。
