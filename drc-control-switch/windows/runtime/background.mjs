import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, spawn } from 'node:child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);

const singleton = net.createServer(s => s.destroy());
singleton.on('error', () => process.exit(0));
singleton.listen('\\\\.\\pipe\\RDCController-Administrator-01a0d344');

let child = null, online = false, deviceId = '', retryAt = 0, stopping = false, lastMessage = 0;
let verification = '', code = '', error = '';

const desired = () => {
  try { return fs.readFileSync('desired.txt', 'utf8').trim() === 'on'; }
  catch { return false; }
};

function writeStatus() {
  const data = {
    enabled: desired(),
    online: !!child && online && !stopping && Date.now() - lastMessage < 6000,
    running: !!child,
    stopping,
    deviceId,
    verification,
    code,
    error,
    updated: new Date().toISOString(),
    pid: process.pid
  };
  try {
    fs.writeFileSync('status.tmp', JSON.stringify(data));
    fs.renameSync('status.tmp', 'status.json');
  } catch {}
}

function output(chunk) {
  const text = chunk.toString();
  fs.appendFileSync('connection.log', text);
  const url = text.match(/https:\/\/[^\s]+(?:verify|activate)[^\s]*/i);
  if (url) verification = url[0];
  const pair = text.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/);
  if (pair) code = pair[0];
  if (/startup failed:/i.test(text)) error = text.trim();
}

function start() {
  if (fs.existsSync('connection.log') && fs.statSync('connection.log').size > 2000000)
    fs.renameSync('connection.log', 'connection.previous.log');
  verification = ''; code = ''; error = ''; online = false; stopping = false;
  child = fork(path.join(root, 'worker.mjs'), [], {
    cwd: root,
    execPath: process.execPath,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });
  const current = child;
  child.stdout.on('data', output);
  child.stderr.on('data', output);
  child.on('message', m => {
    online = !!m.online;
    deviceId = m.deviceId || '';
    lastMessage = Date.now();
    if (online) { verification = ''; code = ''; error = ''; }
  });
  child.on('error', e => { error = e.message; });
  child.on('exit', () => {
    if (child === current) {
      child = null; online = false; stopping = false;
      retryAt = Date.now() + 15000; writeStatus();
    }
  });
}

function stop() {
  stopping = true; online = false;
  const current = child;
  try { current.send('stop'); } catch {}
  setTimeout(() => {
    if (child === current) {
      spawn('taskkill', ['/PID', String(current.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
  }, 8500).unref();
}

setInterval(() => {
  if (desired()) {
    if (!child && Date.now() >= retryAt) start();
  } else if (child && !stopping) stop();
  writeStatus();
}, 500);
writeStatus();
