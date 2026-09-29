# 汇云局域网跨传

**Version: 1.1.0**
**Release Standard: v1.4.0**
**Current Compatible Standard: v1.4.0**
**Security Level: S2（局域网网络服务）**

一个给 Windows 和 macOS 使用的轻量局域网文件快传工具。文件在电脑之间点对点直传，不经过云端。

v1.1.0 已从 Electron 完整改写为 **Rust + Tauri 原生轻量架构**，不再把 Chromium 和 Node.js 打进程序。

## 为什么改成轻量版

v1.0.0 Windows 免安装版约 **105 MB**。

v1.1.0 Windows 便携版当前本机正式构建约 **2.8 MB**，核心原因：

- 不再捆绑 Chromium；
- 不再捆绑 Node.js；
- 文件传输核心改为 Rust；
- 界面使用系统 WebView；
- 只保留局域网快传真正需要的功能。

Windows 使用系统 WebView2；Windows 10/11 通常已经安装。macOS 使用系统 WebKit。

## 使用方法

### 发送方

1. 两台电脑都打开“汇云局域网跨传”。
2. 在左侧“附近电脑”中点击目标电脑名称。
3. 把文件或文件夹直接拖入发送区域。
4. 也可以点击“选择文件”或“选择文件夹”。
5. 等待接收方选择保存位置后自动开始传输。

### 接收方

收到请求后：

- Windows 任务栏图标会闪烁；
- macOS Dock 会请求用户注意；
- 窗口标题会显示“谁发来文件”；
- 软件顶部会出现待接收卡片。

点击“选择位置并接收”，选好保存目录后才开始传输。也可以直接拒绝。

## 主要功能

- Windows + macOS；
- 同一局域网自动发现电脑；
- 文件、多个文件、文件夹、空文件夹；
- 拖拽发送；
- 接收方人工确认；
- 自定义本机显示名称；
- 实时传输进度、速度、文件数量、总大小；
- 大文件流式传输，不整文件读入内存；
- 同名顶层文件/文件夹自动使用“(1)”“(2)”等新名称；
- symlink 不跟随，扫描时跳过；
- Windows 关闭窗口默认最小化，继续等待接收；
- macOS 关闭窗口默认隐藏；
- 重复双击程序不会启动第二个接收服务，而是唤醒已经运行的窗口；
- 软件内“退出”按钮才真正停止后台接收服务。

## 局域网要求

两台电脑必须位于能够互相访问的局域网。

首次在 Windows 使用时，如果系统弹出防火墙提示，请允许“专用网络”。

如果公司网络、访客 Wi-Fi 或 VLAN 配置禁止终端之间直接访问，设备可能无法互相发现。

## 传输设计

v1.1.0 使用轻量自定义协议：

```text
UDP 广播
  ↓
自动发现附近电脑
  ↓
发送 Offer
  ↓
接收方人工选择保存位置
  ↓
TCP 单连接流式直传
  ↓
.huiyun-part 临时文件
  ↓
完整写入后 rename 为正式文件
```

单条 TCP 流足以充分利用常见千兆局域网，同时比多进程/多运行时方案更小、更简单。

## 安全边界

本软件属于 **S2**，因为会在局域网中监听文件接收连接。

当前安全措施：

- 每次启动生成新的 256-bit 临时 capability token；
- discovery beacon 只用于同一局域网发现；
- 文件请求必须携带当前目标电脑 token；
- TCP 接收端拒绝公网来源，只接受 loopback、私网和 link-local 地址；
- 每一笔传输必须由接收方人工确认；
- 接收端只允许写入 manifest 中声明的文件；
- 文件路径拒绝绝对路径、`..`、空路径段和 NUL；
- Windows 接收时检查 Windows 不支持的特殊文件名；
- 文件大小必须与 manifest 一致；
- 文件先写临时文件，完整接收后再 rename；
- 已存在同名顶层对象时不会静默覆盖；
- 不把 token 或文件内容写入日志；
- symlink 不跟随。

### 重要限制

**v1.1.0 没有端到端加密，只用于可信局域网。**

同一局域网中具备抓包能力的第三方理论上可以看到 discovery 信息或传输内容，因此不要在机场、酒店、咖啡店等不可信公共网络发送敏感资料。

另外：

- 暂不支持断点续传；
- 不支持互联网/NAT 穿透；
- discovery 当前使用 IPv4 UDP 广播；
- macOS 包为内部使用的 ad-hoc/未公证版本，首次可能需要在 Finder 中右键选择“打开”；
- **v1.0.0 与 v1.1.0 协议不同，不互传；公司电脑应统一升级到 v1.1.0。**

详细安全说明见 [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md)。

## 轻量架构

```text
ui/
  index.html
  styles.css
  app.js

src-tauri/
  src/main.rs       # 桌面窗口、命令、拖拽、生命周期
  src/discovery.rs  # UDP 局域网发现
  src/transfer.rs   # TCP 文件发送/接收
  src/settings.rs   # 本机名称/设备 ID
  src/state.rs      # 运行状态
  src/util.rs       # 路径安全、协议帧、局域网判断
```

没有 Electron、没有 node_modules、没有前端框架。

## 开发与测试

要求：

- Rust stable；
- Windows：Visual Studio Build Tools；
- macOS：Xcode Command Line Tools。

运行测试：

```bash
cd src-tauri
cargo test
```

格式检查：

```bash
cd src-tauri
cargo fmt --check
```

Windows 便携版：

```powershell
powershell -File scripts/build-windows.ps1
```

macOS universal 便携版：

```bash
bash scripts/build-macos.sh
```

构建产物统一放在 `dist/`。

## 当前自动测试

Rust 单元测试覆盖：

- 私网/公网 IP 判断；
- path traversal 拒绝；
- JSON 协议帧读写；
- 顶层同名不覆盖；
- 文件与空文件夹扫描；
- manifest 重复路径拒绝；
- 选择多个同名顶层对象时自动重命名；
- discovery 基础参数检查；
- 电脑名称连续修改与持久化；
- symlink 扫描跳过（系统支持创建测试链接时）。

PR 还必须通过 GitHub Secret Scan、Windows 构建和 macOS universal 构建后才能合并。

## 图标

继续使用本项目原创“两台电脑 + 双向箭头”图标：

- `build/icon.svg`
- `build/icon.png`
- `build/icon.ico`
- `build/icon.icns`

生成脚本：`scripts/generate-icons.py`。
