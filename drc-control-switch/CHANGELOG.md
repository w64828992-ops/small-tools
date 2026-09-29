# Changelog

## v1.1.2 - 2026-09-30

### 性能优化

- 修复 Playwright 关闭后快速重新开启时，旧进程尚未释放 8931 端口导致新进程启动失败并触发 5 秒退避的问题。
- Playwright 管理进程改为常驻；关闭 Playwright 时只停止 MCP 子进程，下一次开启无需重新冷启动管理器。
- 管理器轮询从 750ms 缩短到 150ms，端口健康检查超时从 500ms 缩短到 150ms。
- 控制器界面状态刷新从 1000ms 缩短到 250ms。

### 稳定性

- 主动关闭 Playwright 时保留子进程引用直到系统确认退出，避免新旧进程抢占 8931 端口。
- 主动关闭后的重启等待仅 100ms；真正异常退出仍保留 1.5 秒退避，避免故障时高频重启。
- RDC 在线前 Playwright 仍不会启动，原有依赖保护规则不变。

### 验证结果

- 优化前实测：Playwright 关→开约 7.2 秒。
- v1.1.2 候选版实测：首次启动约 0.89 秒；连续两次关→开分别约 1.38 秒、1.39 秒。
- Playwright 关闭约 0.18–0.20 秒；RDC 全程保持在线。
- 真实 RDC 断开 / 重连仍不在远程开发会话中自动执行。

## v1.1.1 - 2026-09-29

### 修复

- 修复 Windows 升级安装时目标目录已存在 `node_modules` 就跳过依赖同步的问题。
- 升级安装现在会合并正式构建中打包的依赖，确保本地 `@playwright/mcp` 不再依赖全局安装兜底。
- 新增 `-SkipShortcut` 安装参数，供无副作用的升级模拟测试使用。

### 测试

- 新增旧目录已存在 `node_modules`、但缺少 Playwright MCP 的升级模拟测试。
- 验证升级后本地 Playwright MCP 存在，且 `package-lock.json` 与正式构建一致。
- 测试过程不执行真实 RDC 断开 / 重连。

### 兼容性

- RDC / Playwright 开关逻辑与 v1.1.0 保持不变。
- Windows 桌面运行目录和 Codex Playwright HTTP 地址保持不变。

## v1.1.0 - 2026-09-29

### 新增

- 新增 Windows “汇云电脑控制器”，把 RDC 与 Playwright MCP 集成到同一控制面板。
- 新增 Playwright 独立开关、真实运行状态、失败状态与“启动 / 重连”状态。
- 新增“全部开启”，按 RDC → Playwright 的依赖顺序启动。
- 新增本机 Playwright MCP 服务：`http://127.0.0.1:8931/mcp`。
- 新增 Windows 可复现构建、Codex 配置迁移、桌面安装和 smoke test。
- 新增 Playwright 服务层依赖保护：RDC 未实际在线时 Playwright 不启动。

### 修改

- Windows RDC 控制器软件名称统一为“汇云电脑控制器”。
- 关闭 RDC 时，如 Playwright 正在运行，先关闭 Playwright 再关闭 RDC。
- Codex Playwright 配置由 stdio 启动方式迁移为本机 Streamable HTTP 服务。
- Windows 状态判断由按钮状态升级为状态文件 + 实际进程 + Playwright 端口检测。

### 安全

- Playwright 服务只绑定 `127.0.0.1`，不对局域网或公网开放。
- 浏览器 Profile 保存在 LocalAppData，不进入仓库。
- 自动测试不主动切断当前真实 RDC 远程链路。

### 测试

- Windows 编译：通过。
- Node 脚本语法：通过。
- Playwright MCP v0.0.82 依赖检查：通过。
- UI 无交互渲染：通过。
- 依赖模拟：RDC 在线时 Playwright 可启动；Playwright 关闭后端口关闭；RDC 离线时 Playwright 不启动。
- 真实 RDC 断开 / 重连：未自动执行，避免切断当前远程开发链路。

### 兼容性与限制

- Windows 依赖 Microsoft Edge。
- Playwright MCP 端口固定为 8931。
- Codex 若在 Playwright 关闭时初始化，必要时需重新打开或新建会话以重新发现 MCP 服务。

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
