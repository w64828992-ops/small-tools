using System;
using System.IO;
using System.Drawing;
using System.Windows.Forms;
using System.Diagnostics;
using System.Collections.Generic;
using System.Web.Script.Serialization;

class Controller : Form
{
    const string Version = "1.1.1";
    static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;

    readonly Label rdcStatus = new Label(), rdcDetail = new Label();
    readonly Label pwStatus = new Label(), pwDetail = new Label(), summary = new Label();
    readonly Button rdcToggle = new Button(), pwToggle = new Button();
    readonly Button allOn = new Button(), verify = new Button(), retry = new Button();
    readonly Timer refreshTimer = new Timer(), dependencyTimer = new Timer();

    string verification = "";
    bool rdcDesired, rdcOnline, rdcRunning;
    bool pwDesired, pwOnline, pwRunning;
    bool pendingRdcOff;
    int dependencyTicks;

    static string P(string name) { return Path.Combine(Root, name); }

    static void Launch(string script)
    {
        string node = P("node.exe");
        if (!File.Exists(node)) node = "node.exe";
        var s = new ProcessStartInfo(node, "\"" + P(script) + "\"");
        s.UseShellExecute = false;
        s.CreateNoWindow = true;
        s.WorkingDirectory = Root;
        Process.Start(s);
    }

    static bool ReadDesired(string file)
    {
        try { return File.Exists(P(file)) && File.ReadAllText(P(file)).Trim() == "on"; }
        catch { return false; }
    }

    static void SetDesired(string file, bool value)
    {
        File.WriteAllText(P(file), value ? "on" : "off");
    }

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
        try { return d != null && d.ContainsKey(key) && Convert.ToBoolean(d[key]); }
        catch { return false; }
    }

    static string S(Dictionary<string, object> d, string key)
    {
        try { return d != null && d.ContainsKey(key) ? Convert.ToString(d[key]) : ""; }
        catch { return ""; }
    }

    Controller()
    {
        Text = "汇云电脑控制器";
        ClientSize = new Size(650, 500);
        Font = new Font("Microsoft YaHei UI", 10);
        BackColor = Color.FromArgb(247, 248, 250);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;
        if (File.Exists(P("Controller.ico"))) Icon = new Icon(P("Controller.ico"));

        Controls.Add(new Label {
            Text = "汇云电脑控制器",
            Font = new Font(Font.FontFamily, 18, FontStyle.Bold),
            Bounds = new Rectangle(26, 20, 430, 36)
        });
        Controls.Add(new Label {
            Text = "RDC + Playwright 统一控制",
            ForeColor = Color.DimGray,
            Bounds = new Rectangle(28, 58, 430, 24)
        });
        Controls.Add(new Label {
            Text = "v" + Version,
            TextAlign = ContentAlignment.MiddleRight,
            ForeColor = Color.DimGray,
            Bounds = new Rectangle(530, 24, 90, 26)
        });

        var rdcBox = MakeBox(26, 96, 598, 125);
        rdcBox.Controls.Add(MakeTitle("RDC 远程连接", 16, 12));
        rdcStatus.SetBounds(18, 45, 300, 30);
        rdcStatus.Font = new Font(Font.FontFamily, 14, FontStyle.Bold);
        rdcBox.Controls.Add(rdcStatus);
        rdcDetail.SetBounds(18, 78, 360, 36);
        rdcDetail.ForeColor = Color.DimGray;
        rdcBox.Controls.Add(rdcDetail);
        rdcToggle.SetBounds(405, 45, 165, 42);
        rdcToggle.FlatStyle = FlatStyle.Flat;
        rdcToggle.ForeColor = Color.White;
        rdcToggle.Click += delegate { ToggleRdc(); };
        rdcBox.Controls.Add(rdcToggle);

        var pwBox = MakeBox(26, 234, 598, 125);
        pwBox.Controls.Add(MakeTitle("Playwright 浏览器控制", 16, 12));
        pwStatus.SetBounds(18, 45, 300, 30);
        pwStatus.Font = new Font(Font.FontFamily, 14, FontStyle.Bold);
        pwBox.Controls.Add(pwStatus);
        pwDetail.SetBounds(18, 78, 360, 36);
        pwDetail.ForeColor = Color.DimGray;
        pwBox.Controls.Add(pwDetail);
        pwToggle.SetBounds(405, 45, 165, 42);
        pwToggle.FlatStyle = FlatStyle.Flat;
        pwToggle.ForeColor = Color.White;
        pwToggle.Click += delegate { TogglePlaywright(); };
        pwBox.Controls.Add(pwToggle);

        allOn.Text = "全部开启";
        allOn.SetBounds(26, 378, 170, 42);
        allOn.Click += delegate { EnableAll(); };
        Controls.Add(allOn);

        verify.Text = "设备验证";
        verify.SetBounds(210, 378, 130, 42);
        verify.Click += delegate {
            if (verification.StartsWith("https://mcp.desktopcommander.app/"))
                Process.Start(new ProcessStartInfo(verification) { UseShellExecute = true });
        };
        Controls.Add(verify);

        retry.Text = "重新启动";
        retry.SetBounds(354, 378, 130, 42);
        retry.Click += delegate { RetryManagers(); };
        Controls.Add(retry);

        summary.SetBounds(26, 434, 598, 25);
        summary.Font = new Font(Font.FontFamily, 10, FontStyle.Bold);
        Controls.Add(summary);

        Controls.Add(new Label {
            Text = "关闭窗口不会关闭后台服务；只有开关按钮会改变服务状态。",
            Bounds = new Rectangle(26, 465, 598, 24),
            ForeColor = Color.DimGray,
            Font = new Font(Font.FontFamily, 9)
        });

        dependencyTimer.Interval = 500;
        dependencyTimer.Tick += delegate { ContinueRdcOffSequence(); };

        refreshTimer.Interval = 1000;
        refreshTimer.Tick += delegate { UpdateState(); };
        refreshTimer.Start();
        UpdateState();
    }

    Panel MakeBox(int x, int y, int w, int h)
    {
        var p = new Panel {
            Bounds = new Rectangle(x, y, w, h),
            BackColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle
        };
        Controls.Add(p);
        return p;
    }

    Label MakeTitle(string text, int x, int y)
    {
        return new Label {
            Text = text,
            Font = new Font(Font.FontFamily, 11, FontStyle.Bold),
            Bounds = new Rectangle(x, y, 320, 26)
        };
    }

    void EnableAll()
    {
        try {
            SetDesired("desired.txt", true);
            Launch("launch.mjs");
            SetDesired("playwright_desired.txt", true);
            Launch("playwright-launch.mjs");
            UpdateState();
        } catch (Exception e) { MessageBox.Show(e.Message, "汇云电脑控制器"); }
    }

    void TogglePlaywright()
    {
        try {
            if (pwDesired && !pwRunning && !pwOnline) {
                SetDesired("desired.txt", true);
                Launch("launch.mjs");
                Launch("playwright-launch.mjs");
            } else if (pwDesired || pwRunning) {
                SetDesired("playwright_desired.txt", false);
                Launch("playwright-launch.mjs");
            } else {
                SetDesired("desired.txt", true);
                Launch("launch.mjs");
                SetDesired("playwright_desired.txt", true);
                Launch("playwright-launch.mjs");
            }
            UpdateState();
        } catch (Exception e) { MessageBox.Show(e.Message, "Playwright"); }
    }

    void ToggleRdc()
    {
        try {
            if (rdcDesired && !rdcRunning && !rdcOnline) {
                Launch("launch.mjs");
                UpdateState();
                return;
            }
            if (!(rdcDesired || rdcRunning)) {
                SetDesired("desired.txt", true);
                Launch("launch.mjs");
                UpdateState();
                return;
            }
            if (pwDesired || pwRunning) {
                SetDesired("playwright_desired.txt", false);
                Launch("playwright-launch.mjs");
                pendingRdcOff = true;
                dependencyTicks = 0;
                rdcToggle.Enabled = false;
                dependencyTimer.Start();
            } else {
                SetDesired("desired.txt", false);
            }
            UpdateState();
        } catch (Exception e) { MessageBox.Show(e.Message, "RDC"); }
    }

    void ContinueRdcOffSequence()
    {
        dependencyTicks++;
        var pw = FreshJson("playwright_status.json");
        bool stillRunning = B(pw, "running");
        if (!stillRunning || dependencyTicks >= 16) {
            dependencyTimer.Stop();
            pendingRdcOff = false;
            SetDesired("desired.txt", false);
            rdcToggle.Enabled = true;
            UpdateState();
        }
    }

    void RetryManagers()
    {
        try {
            if (rdcDesired) Launch("launch.mjs");
            if (pwDesired) Launch("playwright-launch.mjs");
        } catch (Exception e) { MessageBox.Show(e.Message, "重新启动"); }
    }

    void UpdateState()
    {
        try {
            rdcDesired = ReadDesired("desired.txt");
            pwDesired = ReadDesired("playwright_desired.txt");

            var rdc = FreshJson("status.json");
            rdcOnline = B(rdc, "online");
            rdcRunning = B(rdc, "running");
            verification = S(rdc, "verification");
            string rdcCode = S(rdc, "code");
            string rdcError = S(rdc, "error");

            if (pendingRdcOff) {
                rdcStatus.Text = "正在先关闭 Playwright…";
                rdcStatus.ForeColor = Color.FromArgb(150, 100, 20);
            } else if (!rdcDesired && !rdcRunning) {
                rdcStatus.Text = "已关闭";
                rdcStatus.ForeColor = Color.DimGray;
            } else if (rdcOnline) {
                rdcStatus.Text = "● 已连接";
                rdcStatus.ForeColor = Color.FromArgb(30, 125, 78);
            } else if (rdcCode != "") {
                rdcStatus.Text = "等待设备授权";
                rdcStatus.ForeColor = Color.FromArgb(150, 100, 20);
            } else {
                rdcStatus.Text = rdcDesired ? "正在连接 / 重连…" : "正在断开…";
                rdcStatus.ForeColor = Color.DimGray;
            }

            rdcDetail.Text = rdcCode != "" ? "配对码：" + rdcCode :
                rdcError != "" ? "连接失败，后台会自动重试。" :
                rdcOnline ? "设备：" + Environment.MachineName : "状态以实际后台连接为准。";
            rdcToggle.Text = rdcDesired && !rdcRunning ? "启动 / 重连 RDC" :
                (rdcDesired || rdcRunning) ? "关闭 RDC" : "开启 RDC";
            rdcToggle.BackColor = rdcDesired && !rdcRunning ? Color.FromArgb(30, 125, 78) :
                (rdcDesired || rdcRunning) ? Color.FromArgb(190, 35, 45) : Color.FromArgb(30, 125, 78);
            verify.Enabled = rdcDesired && verification != "";

            var pw = FreshJson("playwright_status.json");
            pwOnline = B(pw, "online");
            pwRunning = B(pw, "running");
            bool waiting = B(pw, "waitingForRdc");
            string pwError = S(pw, "error");

            if (!pwDesired && !pwRunning) {
                pwStatus.Text = "已关闭";
                pwStatus.ForeColor = Color.DimGray;
            } else if (pwOnline) {
                pwStatus.Text = "● 已开启";
                pwStatus.ForeColor = Color.FromArgb(30, 125, 78);
            } else if (waiting || (pwDesired && !rdcOnline)) {
                pwStatus.Text = "等待 RDC 连接";
                pwStatus.ForeColor = Color.FromArgb(150, 100, 20);
            } else if (pwError != "") {
                pwStatus.Text = "启动失败";
                pwStatus.ForeColor = Color.FromArgb(190, 35, 45);
            } else {
                pwStatus.Text = pwDesired ? "正在启动…" : "正在关闭…";
                pwStatus.ForeColor = Color.DimGray;
            }

            pwDetail.Text = pwError != "" ? pwError :
                pwOnline ? "本机服务：http://127.0.0.1:8931/mcp" :
                pwDesired ? "RDC 连接成功后自动启动 Playwright。" : "开启 Playwright 会自动先开启 RDC。";
            pwToggle.Text = pwDesired && !pwRunning ? "启动 / 重连 Playwright" :
                (pwDesired || pwRunning) ? "关闭 Playwright" : "开启 Playwright";
            pwToggle.BackColor = pwDesired && !pwRunning ? Color.FromArgb(30, 125, 78) :
                (pwDesired || pwRunning) ? Color.FromArgb(190, 35, 45) : Color.FromArgb(30, 125, 78);

            summary.Text = rdcOnline && pwOnline ? "RDC + Playwright 控制环境正常" :
                rdcOnline ? "RDC 已连接，Playwright 未开启" :
                "RDC 未连接";
            summary.ForeColor = rdcOnline && pwOnline ? Color.FromArgb(30, 125, 78) : Color.DimGray;
        } catch (IOException) { }
        catch (Exception e) {
            summary.Text = "暂时无法读取状态：" + e.Message;
            summary.ForeColor = Color.FromArgb(190, 35, 45);
        }
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length > 0) {
            if (args[0] == "--on") { SetDesired("desired.txt", true); Launch("launch.mjs"); return 0; }
            if (args[0] == "--off") {
                SetDesired("playwright_desired.txt", false); Launch("playwright-launch.mjs");
                System.Threading.Thread.Sleep(1500);
                SetDesired("desired.txt", false);
                return 0;
            }
            if (args[0] == "--playwright-on") {
                SetDesired("desired.txt", true); Launch("launch.mjs");
                SetDesired("playwright_desired.txt", true); Launch("playwright-launch.mjs"); return 0;
            }
            if (args[0] == "--playwright-off") { SetDesired("playwright_desired.txt", false); Launch("playwright-launch.mjs"); return 0; }
            if (args[0] == "--all-on") {
                SetDesired("desired.txt", true); Launch("launch.mjs");
                SetDesired("playwright_desired.txt", true); Launch("playwright-launch.mjs"); return 0;
            }
            if (args[0] == "--render") {
                Application.EnableVisualStyles();
                using (var f = new Controller()) {
                    f.Show(); Application.DoEvents();
                    using (var b = new Bitmap(f.Width, f.Height)) {
                        f.DrawToBitmap(b, new Rectangle(0, 0, b.Width, b.Height));
                        b.Save(P("preview.png"));
                    }
                    f.Close();
                }
                return 0;
            }
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Controller());
        return 0;
    }
}