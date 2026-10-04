using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.Collections.Generic;
using System.Web.Script.Serialization;

class Controller : Form
{
    const string Version = "1.2.0";
    const string WindowsDeviceId = "7751ebc0-b6ab-4f08-ae1d-42758c1fb546";
    const string MacDeviceId = "5dff6030-6289-47cd-9887-d0628b23e5db";
    static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;

    readonly Label winRdc = new Label(), winPw = new Label(), summary = new Label();
    readonly Label macRdc = new Label(), macPw = new Label(), macHint = new Label();
    readonly TextBox winGpt = new TextBox(), macGpt = new TextBox();
    readonly Button winRdcToggle = new Button(), winPwToggle = new Button(), allOn = new Button();
    readonly Button macRdcToggle = new Button(), macPwToggle = new Button(), saveLabels = new Button();
    readonly Timer refreshTimer = new Timer(), dependencyTimer = new Timer();

    bool rdcDesired, rdcOnline, rdcRunning, pwDesired, pwOnline, pwRunning, pendingRdcOff;
    int dependencyTicks;

    static string P(string name) { return Path.Combine(Root, name); }

    static void Launch(string script)
    {
        string node = P("node.exe");
        if (!File.Exists(node)) node = "node.exe";
        var s = new ProcessStartInfo(node, "\"" + P(script) + "\"") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Root };
        Process.Start(s);
    }

    static bool ReadDesired(string file)
    {
        try { return File.Exists(P(file)) && File.ReadAllText(P(file)).Trim() == "on"; }
        catch { return false; }
    }

    static void SetDesired(string file, bool value) { File.WriteAllText(P(file), value ? "on" : "off"); }

    static Dictionary<string, object> FreshJson(string file, int seconds = 8)
    {
        try {
            string p = P(file);
            if (!File.Exists(p) || DateTime.UtcNow - File.GetLastWriteTimeUtc(p) > TimeSpan.FromSeconds(seconds)) return null;
            return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(p));
        } catch { return null; }
    }

    static bool B(Dictionary<string, object> d, string key)
    {
        try { return d != null && d.ContainsKey(key) && Convert.ToBoolean(d[key]); } catch { return false; }
    }

    Controller()
    {
        Text = "汇云电脑控制中心";
        ClientSize = new Size(820, 650);
        Font = new Font("Microsoft YaHei UI", 10);
        BackColor = Color.FromArgb(247, 248, 250);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;

        Controls.Add(new Label { Text = "汇云电脑控制中心", Font = new Font(Font.FontFamily, 18, FontStyle.Bold), Bounds = new Rectangle(28, 18, 460, 36) });
        Controls.Add(new Label { Text = "双电脑 / 双 GPT 账号 / RDC + Playwright", ForeColor = Color.DimGray, Bounds = new Rectangle(30, 56, 500, 24) });
        Controls.Add(new Label { Text = "v" + Version, TextAlign = ContentAlignment.MiddleRight, ForeColor = Color.DimGray, Bounds = new Rectangle(690, 24, 90, 24) });

        BuildWindowsCard();
        BuildMacCard();

        allOn.Text = "本机全部开启";
        allOn.SetBounds(28, 552, 170, 42);
        allOn.Click += delegate { EnableAllLocal(); };
        Controls.Add(allOn);

        saveLabels.Text = "保存 GPT 标签";
        saveLabels.SetBounds(214, 552, 160, 42);
        saveLabels.Click += delegate { SaveLabels(); };
        Controls.Add(saveLabels);

        summary.SetBounds(28, 608, 750, 24);
        summary.Font = new Font(Font.FontFamily, 10, FontStyle.Bold);
        Controls.Add(summary);

        dependencyTimer.Interval = 200;
        dependencyTimer.Tick += delegate { ContinueRdcOffSequence(); };
        refreshTimer.Interval = 250;
        refreshTimer.Tick += delegate { UpdateState(); };

        LoadLabels();
        refreshTimer.Start();
        UpdateState();
    }

    void BuildWindowsCard()
    {
        var box = Card(28, 96, 764, 205);
        box.Controls.Add(Title("电脑 A · Windows（当前控制器所在设备）", 18, 12));
        box.Controls.Add(new Label { Text = "设备：WIM-20260828KZJ    ID：7751ebc0…b546", ForeColor = Color.DimGray, Bounds = new Rectangle(18, 40, 480, 24) });
        box.Controls.Add(new Label { Text = "GPT 账号标签：", Bounds = new Rectangle(18, 70, 110, 26) });
        winGpt.SetBounds(128, 67, 250, 30); box.Controls.Add(winGpt);

        winRdc.SetBounds(18, 112, 300, 28); winRdc.Font = new Font(Font.FontFamily, 12, FontStyle.Bold); box.Controls.Add(winRdc);
        winPw.SetBounds(18, 148, 300, 28); winPw.Font = new Font(Font.FontFamily, 12, FontStyle.Bold); box.Controls.Add(winPw);

        winRdcToggle.SetBounds(500, 105, 220, 36); winRdcToggle.FlatStyle = FlatStyle.Flat; winRdcToggle.ForeColor = Color.White;
        winRdcToggle.Click += delegate { ToggleRdc(); }; box.Controls.Add(winRdcToggle);
        winPwToggle.SetBounds(500, 149, 220, 36); winPwToggle.FlatStyle = FlatStyle.Flat; winPwToggle.ForeColor = Color.White;
        winPwToggle.Click += delegate { TogglePlaywright(); }; box.Controls.Add(winPwToggle);
    }

    void BuildMacCard()
    {
        var box = Card(28, 318, 764, 214);
        box.Controls.Add(Title("电脑 B · Mac", 18, 12));
        box.Controls.Add(new Label { Text = "设备：Mac.local    ID：5dff6030…e5db", ForeColor = Color.DimGray, Bounds = new Rectangle(18, 40, 480, 24) });
        box.Controls.Add(new Label { Text = "GPT 账号标签：", Bounds = new Rectangle(18, 70, 110, 26) });
        macGpt.SetBounds(128, 67, 250, 30); box.Controls.Add(macGpt);

        macRdc.SetBounds(18, 108, 330, 28); macRdc.Font = new Font(Font.FontFamily, 12, FontStyle.Bold); box.Controls.Add(macRdc);
        macPw.SetBounds(18, 143, 330, 28); macPw.Font = new Font(Font.FontFamily, 12, FontStyle.Bold); box.Controls.Add(macPw);
        macHint.SetBounds(18, 177, 700, 24); macHint.ForeColor = Color.DimGray; box.Controls.Add(macHint);

        macRdcToggle.Text = "远程 RDC：待安全代理"; macRdcToggle.SetBounds(500, 105, 220, 36); macRdcToggle.Enabled = false; box.Controls.Add(macRdcToggle);
        macPwToggle.Text = "远程 Playwright：待安全代理"; macPwToggle.SetBounds(500, 149, 220, 36); macPwToggle.Enabled = false; box.Controls.Add(macPwToggle);
    }

    Panel Card(int x, int y, int w, int h)
    {
        var p = new Panel { Bounds = new Rectangle(x, y, w, h), BackColor = Color.White, BorderStyle = BorderStyle.FixedSingle };
        Controls.Add(p); return p;
    }

    Label Title(string text, int x, int y) { return new Label { Text = text, Font = new Font(Font.FontFamily, 12, FontStyle.Bold), Bounds = new Rectangle(x, y, 520, 28) }; }

    void LoadLabels()
    {
        winGpt.Text = "GPT账号 A（Windows）"; macGpt.Text = "GPT账号 B（Mac）";
        try {
            if (!File.Exists(P("controller_devices.json"))) return;
            var d = new JavaScriptSerializer().Deserialize<Dictionary<string, string>>(File.ReadAllText(P("controller_devices.json")));
            if (d.ContainsKey("windowsGpt")) winGpt.Text = d["windowsGpt"];
            if (d.ContainsKey("macGpt")) macGpt.Text = d["macGpt"];
        } catch { }
    }

    void SaveLabels()
    {
        var d = new Dictionary<string, string> {
            { "windowsDeviceId", WindowsDeviceId }, { "windowsDeviceName", "WIM-20260828KZJ" }, { "windowsGpt", winGpt.Text.Trim() },
            { "macDeviceId", MacDeviceId }, { "macDeviceName", "Mac.local" }, { "macGpt", macGpt.Text.Trim() }
        };
        File.WriteAllText(P("controller_devices.json"), new JavaScriptSerializer().Serialize(d));
        summary.Text = "GPT 标签已保存；设备绑定按 RDC Device ID 固定，不受电脑改名影响。";
        summary.ForeColor = Color.FromArgb(30, 125, 78);
    }

    void EnableAllLocal()
    {
        SetDesired("desired.txt", true); Launch("launch.mjs");
        SetDesired("playwright_desired.txt", true); Launch("playwright-launch.mjs");
        UpdateState();
    }

    void TogglePlaywright()
    {
        if (pwDesired || pwRunning) { SetDesired("playwright_desired.txt", false); Launch("playwright-launch.mjs"); }
        else { SetDesired("desired.txt", true); Launch("launch.mjs"); SetDesired("playwright_desired.txt", true); Launch("playwright-launch.mjs"); }
        UpdateState();
    }

    void ToggleRdc()
    {
        if (!(rdcDesired || rdcRunning)) { SetDesired("desired.txt", true); Launch("launch.mjs"); UpdateState(); return; }
        if (pwDesired || pwRunning) {
            SetDesired("playwright_desired.txt", false); Launch("playwright-launch.mjs");
            pendingRdcOff = true; dependencyTicks = 0; winRdcToggle.Enabled = false; dependencyTimer.Start();
        } else SetDesired("desired.txt", false);
        UpdateState();
    }

    void ContinueRdcOffSequence()
    {
        dependencyTicks++;
        var pw = FreshJson("playwright_status.json");
        if (!B(pw, "running") || dependencyTicks >= 16) {
            dependencyTimer.Stop(); pendingRdcOff = false; SetDesired("desired.txt", false); winRdcToggle.Enabled = true; UpdateState();
        }
    }

    void UpdateState()
    {
        rdcDesired = ReadDesired("desired.txt"); pwDesired = ReadDesired("playwright_desired.txt");
        var rdc = FreshJson("status.json"); rdcOnline = B(rdc, "online"); rdcRunning = B(rdc, "running");
        var pw = FreshJson("playwright_status.json"); pwOnline = B(pw, "online"); pwRunning = B(pw, "running");

        winRdc.Text = pendingRdcOff ? "RDC：正在先关闭 Playwright…" : rdcOnline ? "● RDC：已连接" : (rdcDesired || rdcRunning) ? "RDC：连接中 / 重连中" : "RDC：已关闭";
        winRdc.ForeColor = rdcOnline ? Color.FromArgb(30,125,78) : pendingRdcOff ? Color.FromArgb(150,100,20) : Color.DimGray;
        winPw.Text = pwOnline ? "● Playwright：已开启" : pwDesired ? "Playwright：启动中 / 等待 RDC" : "Playwright：已关闭";
        winPw.ForeColor = pwOnline ? Color.FromArgb(30,125,78) : Color.DimGray;

        winRdcToggle.Text = (rdcDesired || rdcRunning) ? "关闭本机 RDC" : "开启本机 RDC";
        winRdcToggle.BackColor = (rdcDesired || rdcRunning) ? Color.FromArgb(190,35,45) : Color.FromArgb(30,125,78);
        winPwToggle.Text = (pwDesired || pwRunning) ? "关闭本机 Playwright" : "开启本机 Playwright";
        winPwToggle.BackColor = (pwDesired || pwRunning) ? Color.FromArgb(190,35,45) : Color.FromArgb(30,125,78);

        macRdc.Text = "RDC：离线（RDC 云端最后确认）";
        macRdc.ForeColor = Color.DimGray;
        macPw.Text = "Playwright：未知（Mac 当前离线）";
        macPw.ForeColor = Color.DimGray;
        macHint.Text = "Mac.local 当前未连接 RDC。为避免保存/复制 RDC 私有令牌，远程开关暂不启用。";

        summary.Text = "当前：Windows " + (rdcOnline ? "RDC在线" : "RDC离线") + " / " + (pwOnline ? "Playwright在线" : "Playwright关闭") + "；Mac 离线。";
        summary.ForeColor = rdcOnline ? Color.FromArgb(30,125,78) : Color.DimGray;
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length > 0) {
            if (args[0] == "--on") { SetDesired("desired.txt", true); Launch("launch.mjs"); return 0; }
            if (args[0] == "--off") { SetDesired("playwright_desired.txt", false); Launch("playwright-launch.mjs"); System.Threading.Thread.Sleep(300); SetDesired("desired.txt", false); return 0; }
            if (args[0] == "--playwright-on") { SetDesired("desired.txt", true); Launch("launch.mjs"); SetDesired("playwright_desired.txt", true); Launch("playwright-launch.mjs"); return 0; }
            if (args[0] == "--playwright-off") { SetDesired("playwright_desired.txt", false); Launch("playwright-launch.mjs"); return 0; }
            if (args[0] == "--all-on") { SetDesired("desired.txt", true); Launch("launch.mjs"); SetDesired("playwright_desired.txt", true); Launch("playwright-launch.mjs"); return 0; }
            if (args[0] == "--render") { Application.EnableVisualStyles(); using (var f = new Controller()) { f.Show(); Application.DoEvents(); using (var b = new Bitmap(f.Width, f.Height)) { f.DrawToBitmap(b, new Rectangle(0,0,b.Width,b.Height)); b.Save(P("preview.png")); } f.Close(); } return 0; }
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); Application.Run(new Controller()); return 0;
    }
}
