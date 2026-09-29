# 汇云局域网跨传

**Version: 1.0.0**
**Release Standard: v1.4.0**
**Current Compatible Standard: v1.4.0**
**Security Level: S2（局域网网络服务）**

一个给 Windows 和 macOS 使用的局域网点对点文件快传工具。电脑之间直接传输，不经过云端。

## 使用方法

### 发送方

1. 两台电脑都打开“汇云局域网跨传”。
2. 在左侧“附近电脑”里点击要发送到的电脑名称。
3. 把文件或文件夹直接拖进发送区域。
4. 等待对方选择保存位置。
5. 对方确认后自动开始传输。

也可以使用“选择文件”或“选择文件夹”按钮。

### 接收方

1. 收到文件请求后：
   - Windows 任务栏图标会闪烁；
   - macOS Dock 图标会跳动；
   - 系统通知和软件界面会显示是谁发来的。
2. 点击“选择位置并接收”。
3. 选择保存文件夹后开始接收。
4. 如果不需要，点击“拒绝”。

如果保存位置里已经有同名文件或文件夹，软件会自动使用“名称 (1)”“名称 (2)”等新名称，不会静默覆盖原文件。

## 第一次使用

Windows 第一次运行时可能出现防火墙提示，请勾选并允许“专用网络”。

两台电脑必须处于能够互相访问的同一局域网/VLAN。公司网络如果禁止终端之间直接访问，也会导致无法发现或传输。

## 功能

- Windows + macOS。
- 自动发现同一局域网电脑。
- 文件、多个文件、文件夹、空文件夹。
- 直接拖拽发送。
- 接收方人工确认后才开始传输。
- 实时进度、速度、文件数量和总大小。
- 4 个文件并发上传，大文件使用流式传输，不整文件读入内存。
- 顶层重名自动避让。
- 任务栏 / Dock 提醒。
- 可修改本机显示名称。
- Windows 关闭窗口默认最小化，后台继续等待接收。
- 托盘菜单支持“打开 / 退出”。

## 安全边界

本软件按 Repository Standard 的 **S2** 级别管理，因为它会在局域网中监听网络请求。

v1.0.0 的安全措施：

- 每次程序启动生成新的 256-bit 临时 capability token。
- token 只用于当前运行周期。
- 所有传输 HTTP 请求必须带目标电脑的有效 token。
- 网络服务拒绝非 loopback / 私有局域网 / link-local 来源。
- 每一次传输仍必须由接收方人工确认。
- 接收端只允许写入发送方 offer manifest 中声明的文件。
- 文件路径经过 traversal 检查，禁止绝对路径、`..`、NUL 等。
- 文件先写入临时 `.part` 文件，完整接收后再改名。
- 不记录 token 和文件内容。
- symlink 不跟随，扫描时直接跳过。

### 重要限制

**v1.0.0 没有端到端加密。仅用于可信局域网。**

同一局域网中能够抓包的攻击者理论上可能看到传输内容或 discovery beacon，因此不要在不可信公共 Wi-Fi 上传输敏感文件。

另外：

- v1.0.0 不支持断点续传；
- 不支持互联网远程传输；
- discovery 当前使用 IPv4 UDP 广播；
- Windows 不支持的特殊文件名从 Mac 发往 Windows 时会在接收确认阶段拒绝；
- Mac 版本当前为内部使用的未签名包，首次可能需要在 Finder 中右键应用并选择“打开”。

更详细说明见 [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md)。

## 技术结构

```text
UDP broadcast
    ↓
附近设备发现
    ↓
HTTP offer
    ↓
接收方人工选择保存位置
    ↓
Node.js stream 并发文件上传
    ↓
.part 临时文件
    ↓
完整接收后 rename
```

核心模块：

- `src/discovery.js`：局域网设备发现。
- `src/transfer.js`：Offer、接收授权、流式文件传输。
- `src/path-utils.js`：路径安全和重名保护。
- `src/network-utils.js`：局域网地址判断。
- `src/settings.js`：设备名称和设备 ID。
- `src/main.js`：Electron 主进程、通知、托盘和窗口生命周期。
- `src/preload.js`：Renderer 最小权限桥接。

## 开发

要求：

- Node.js 22+
- npm
- Windows 或 macOS

安装：

```bash
npm ci
```

运行：

```bash
npm start
```

检查：

```bash
npm run check
```

Windows 打包：

```bash
npm run dist:win
```

macOS 打包：

```bash
npm run dist:mac
```

GitHub Actions 会在 Windows 和 macOS 上分别测试和打包。

## 图标

图标为本项目原创简易图标：“两台电脑 + 双向箭头”。

源码：

- `build/icon.svg`
- `scripts/generate-icons.py`

重新生成 PNG / ICO / ICNS：

```bash
python -m pip install pillow
python scripts/generate-icons.py
```

## 当前未覆盖

- 断点续传；
- 端到端加密；
- 跨互联网/NAT；
- 复杂权限分组和企业集中管理；
- Electron GUI 自动化测试。

这些不影响 v1.0.0 在可信局域网中的基础文件快传场景。
