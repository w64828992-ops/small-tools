import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const port = 8931;

const singleton = net.createServer(s => s.destroy());
singleton.on('error', () => process.exit(0));
singleton.listen('\\\\.\\pipe\\HuiyunPlaywrightController-Administrator-01a0d344');

let child = null, ready = false, error = '', retryAt = 0, idleOffSince = 0;

const desired = () => {
  try { return fs.readFileSync('playwright_desired.txt', 'utf8').trim() === 'on'; }
  catch { return false; }
};

function rdcReady() {
  try {
    const p = path.join(root, 'status.json');
    if (!fs.existsSync(p)) return false;
    if (Date.now() - fs.statSync(p).mtimeMs > 8000) return false;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return d.enabled === true && d.online === true;
  } catch { return false; }
}

function portOpen() {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port });
    const done = value => { try { s.destroy(); } catch {} resolve(value); };
    s.setTimeout(500);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}

async function writeStatus() {
  const online = !!child && ready && await portOpen();
  const data = {
    enabled: desired(),
    online,
    running: !!child,
    waitingForRdc: desired() && !rdcReady(),
    error,
    port,
    updated: new Date().toISOString(),
    pid: process.pid
  };
  try {
    fs.writeFileSync('playwright_status.tmp', JSON.stringify(data));
    fs.renameSync('playwright_status.tmp', 'playwright_status.json');
  } catch {}
}

function playwrightCommand() {
  const localCli = path.join(root, 'node_modules', '@playwright', 'mcp', 'cli.js');
  if (fs.existsSync(localCli)) return { cmd: process.execPath, args: [localCli] };

  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const globalCli = path.join(appData, 'npm', 'node_modules', '@playwright', 'mcp', 'cli.js');
  if (fs.existsSync(globalCli)) return { cmd: process.execPath, args: [globalCli] };

  throw new Error('Playwright MCP 未安装。');
}

function start() {
  const profile = path.join(process.env.LOCALAPPDATA || root, 'HuiyunComputerController', 'playwright-profile');
  fs.mkdirSync(profile, { recursive: true });

  let base;
  try {
    base = playwrightCommand();
  } catch (e) {
    error = e && e.message ? e.message : String(e);
    retryAt = Date.now() + 15000;
    return;
  }

  const extra = ['--port', String(port), '--host', '127.0.0.1', '--browser', 'msedge', '--user-data-dir', profile];
  const cmd = base.cmd;
  const args = base.args.concat(extra);

  ready = false; error = '';
  child = spawn(cmd, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const current = child;

  const output = chunk => {
    const text = chunk.toString();
    try { fs.appendFileSync('playwright.log', text); } catch {}
    if (/Listening on http:\/\/(?:localhost|127\.0\.0\.1):8931/i.test(text)) ready = true;
    if (/error|failed/i.test(text) && !/0 errors/i.test(text)) error = text.trim().slice(-400);
  };

  child.stdout.on('data', output);
  child.stderr.on('data', output);
  child.on('error', e => { error = e.message; });
  child.on('exit', code => {
    if (child === current) {
      child = null; ready = false;
      if (code && !error) error = 'Playwright 进程退出，代码 ' + code;
      retryAt = Date.now() + 5000;
    }
  });
}

function stop() {
  if (!child) return;
  const pid = child.pid;
  child = null; ready = false;
  spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}

setInterval(async () => {
  const want = desired();
  const canRun = want && rdcReady();

  if (canRun) {
    idleOffSince = 0;
    if (!child && Date.now() >= retryAt) start();
  } else {
    if (child) stop();
    if (!want) {
      if (!idleOffSince) idleOffSince = Date.now();
      if (Date.now() - idleOffSince > 5000) {
        await writeStatus();
        process.exit(0);
      }
    }
  }
  await writeStatus();
}, 750);

await writeStatus();
