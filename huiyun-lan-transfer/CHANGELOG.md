# Changelog

## 1.1.0 - 2026-09-30

### Changed

- 从 Electron + Node.js 完整改写为 Rust + Tauri 轻量架构。
- Windows 便携版从 v1.0.0 的约 105 MB 降至当前本机正式构建约 2.8 MB。
- 文件传输协议改为自定义轻量 TCP 流协议，仍保留 UDP 局域网自动发现。
- 发送改为单 TCP 连接连续流式写入，减少运行时、内存和程序体积。
- Windows 使用系统 WebView2，macOS 使用系统 WebKit，不再捆绑 Chromium。
- Windows 交付改为单 EXE 便携版，不需要安装。
- 增加单实例保护：重复双击只唤醒已有窗口，不重复占用局域网端口。
- 修复 Windows 下修改电脑名称后再次保存设置可能失败的问题。
- macOS 改为 universal .app + ZIP / DMG 内部便携包。

### Kept

- 自动发现局域网电脑。
- 选择电脑后拖拽文件或文件夹发送。
- 接收方人工选择保存位置。
- Windows 任务栏提醒 / macOS Dock 注意力提醒。
- 传输进度、速度、文件数量和总大小。
- 同名文件不覆盖。
- .part 临时文件后完整 rename。
- symlink 跳过。
- S2 安全边界与每次启动临时 capability token。

### Security

- 继续限制只接受 loopback、私有局域网和 link-local 来源。
- manifest 路径和文件大小在接收端重新验证。
- 路径 traversal、绝对路径和非法路径段继续拒绝。
- 明确 v1.1.0 仍没有端到端加密，仅用于可信局域网。

### Compatibility

- v1.1.0 使用协议 v2，与 v1.0.0 不互通；使用时两端应统一版本。

---

## 1.0.0 - 2026-09-29

### Added

- 首个正式版本“汇云局域网跨传”。
- Windows + macOS 局域网自动发现。
- 文件、多个文件、文件夹、空文件夹发送。
- 拖拽发送与文件/文件夹选择入口。
- 接收方人工选择保存位置后开始传输。
- Windows 任务栏闪烁、macOS Dock 提醒和系统通知。
- 传输进度、速度、文件数量与总大小显示。
- Node.js stream 流式文件传输和 4 文件并发。
- 顶层重名自动避让，不静默覆盖。
- capability token、LAN 来源限制、manifest 白名单和路径 traversal 防护。
- .part 临时文件后原子 rename。
- symlink 跳过。
- 原创“两台电脑 + 双向箭头”应用图标。
- Windows NSIS / portable 与 macOS universal DMG / ZIP 打包配置。
- Windows + macOS GitHub Actions 构建验证。
