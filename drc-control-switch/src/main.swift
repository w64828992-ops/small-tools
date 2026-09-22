/*
 DRC Control Switch v1.0.0

 用途：macOS 本地控制面板，用于读取并切换 Desktop Commander Remote 的 LaunchAgent 状态。
 核心规则：关闭窗口只退出控制面板，不改变后台连接；只有用户主动操作开关才执行连接或断开。
 安全：本程序不保存账号、密码、Token、Cookie 或私钥；远程身份认证由 Desktop Commander 自身负责。
 依赖：macOS AppKit、launchctl，以及已存在的 ~/Library/LaunchAgents/com.desktopcommander.remote.plist。
 修改注意：改变 label、LaunchAgent 生命周期或关闭窗口行为时，必须同步 README、CHANGELOG 和 smoke test。
*/

import AppKit
import Foundation

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let label = "com.desktopcommander.remote"
    private let appVersion = "1.0.0"
    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var detailLabel: NSTextField!
    private var toggle: NSSwitch!
    private var indicator: NSView!

    private var domain: String { "gui/\(getuid())" }
    private var plistPath: String {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(label).plist").path
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildWindow()
        refreshStatus()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 430, height: 285),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "DRC 控制开关"
        window.center()
        window.isReleasedWhenClosed = false
        window.delegate = self

        guard let content = window.contentView else { return }

        let banana = NSTextField(labelWithString: "🍌")
        banana.font = NSFont.systemFont(ofSize: 58)
        banana.alignment = .center
        banana.frame = NSRect(x: 25, y: 174, width: 90, height: 70)
        content.addSubview(banana)

        let title = NSTextField(labelWithString: "DRC 电脑控制")
        title.font = NSFont.systemFont(ofSize: 23, weight: .semibold)
        title.frame = NSRect(x: 118, y: 211, width: 245, height: 32)
        content.addSubview(title)

        let subtitle = NSTextField(labelWithString: "关闭此窗口不会断开连接")
        subtitle.textColor = .secondaryLabelColor
        subtitle.font = NSFont.systemFont(ofSize: 13)
        subtitle.frame = NSRect(x: 120, y: 185, width: 260, height: 22)
        content.addSubview(subtitle)

        let versionLabel = NSTextField(labelWithString: "v\(appVersion)")
        versionLabel.textColor = .tertiaryLabelColor
        versionLabel.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        versionLabel.alignment = .right
        versionLabel.frame = NSRect(x: 330, y: 246, width: 72, height: 18)
        content.addSubview(versionLabel)

        indicator = NSView(frame: NSRect(x: 33, y: 119, width: 14, height: 14))
        indicator.wantsLayer = true
        indicator.layer?.cornerRadius = 7
        content.addSubview(indicator)

        statusLabel = NSTextField(labelWithString: "正在检测…")
        statusLabel.font = NSFont.systemFont(ofSize: 20, weight: .medium)
        statusLabel.frame = NSRect(x: 58, y: 110, width: 220, height: 30)
        content.addSubview(statusLabel)

        detailLabel = NSTextField(labelWithString: "")
        detailLabel.textColor = .secondaryLabelColor
        detailLabel.font = NSFont.systemFont(ofSize: 12)
        detailLabel.frame = NSRect(x: 58, y: 86, width: 290, height: 22)
        content.addSubview(detailLabel)

        let line = NSBox(frame: NSRect(x: 25, y: 70, width: 380, height: 1))
        line.boxType = .separator
        content.addSubview(line)

        let switchTitle = NSTextField(labelWithString: "允许 ChatGPT 控制此电脑")
        switchTitle.font = NSFont.systemFont(ofSize: 15, weight: .medium)
        switchTitle.frame = NSRect(x: 28, y: 29, width: 290, height: 25)
        content.addSubview(switchTitle)

        toggle = NSSwitch(frame: NSRect(x: 338, y: 26, width: 60, height: 30))
        toggle.target = self
        toggle.action = #selector(toggleChanged(_:))
        content.addSubview(toggle)

        window.makeKeyAndOrderFront(nil)
    }

    private func isConnected() -> Bool {
        let result = runLaunchctl(["print", "\(domain)/\(label)"])
        return result.code == 0 && result.output.contains("state = running")
    }

    private func refreshStatus(message: String? = nil) {
        let connected = isConnected()
        toggle.state = connected ? .on : .off
        indicator.layer?.backgroundColor = (connected ? NSColor.systemGreen : NSColor.systemRed).cgColor

        if connected {
            statusLabel.stringValue = "连接成功"
            detailLabel.stringValue = message ?? "后台服务正在运行"
        } else {
            statusLabel.stringValue = "连接失败"
            detailLabel.stringValue = message ?? "当前未连接，打开开关即可连接"
        }
    }

    @objc private func toggleChanged(_ sender: NSSwitch) {
        let shouldConnect = sender.state == .on
        sender.isEnabled = false
        statusLabel.stringValue = shouldConnect ? "正在连接…" : "正在断开…"
        detailLabel.stringValue = "请稍候"

        DispatchQueue.global(qos: .userInitiated).async {
            let success = shouldConnect ? self.connect() : self.disconnect()
            DispatchQueue.main.async {
                self.toggle.isEnabled = true
                if success {
                    self.refreshStatus(message: shouldConnect ? "已成功建立控制连接" : "已按你的要求断开连接")
                } else {
                    self.refreshStatus(message: shouldConnect ? "连接操作失败，请再次尝试" : "断开操作失败，请再次尝试")
                }
            }
        }
    }

    private func connect() -> Bool {
        guard FileManager.default.fileExists(atPath: plistPath) else { return false }

        if runLaunchctl(["print", "\(domain)/\(label)"]).code == 0 {
            _ = runLaunchctl(["kickstart", "\(domain)/\(label)"])
        } else {
            _ = runLaunchctl(["bootstrap", domain, plistPath])
            _ = runLaunchctl(["enable", "\(domain)/\(label)"])
            _ = runLaunchctl(["kickstart", "\(domain)/\(label)"])
        }
        Thread.sleep(forTimeInterval: 1.2)
        return isConnected()
    }

    private func disconnect() -> Bool {
        if runLaunchctl(["print", "\(domain)/\(label)"]).code != 0 {
            return true
        }
        _ = runLaunchctl(["bootout", "\(domain)/\(label)"])
        Thread.sleep(forTimeInterval: 0.8)
        return !isConnected()
    }

    private func runLaunchctl(_ args: [String]) -> (code: Int32, output: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        process.arguments = args
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return (process.terminationStatus, String(data: data, encoding: .utf8) ?? "")
        } catch {
            return (-1, error.localizedDescription)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()