# Changelog

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
- `.part` 临时文件后原子 rename。
- symlink 跳过。
- 原创“两台电脑 + 双向箭头”应用图标。
- Windows NSIS / portable 与 macOS universal DMG / ZIP 打包配置。
- Windows + macOS GitHub Actions 构建验证。

### Known limitations

- 无断点续传。
- 无端到端加密，仅限可信局域网。
- 不支持跨互联网/NAT。
- Mac 包未签名。
