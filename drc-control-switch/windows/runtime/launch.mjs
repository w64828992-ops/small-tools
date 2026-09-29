import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const p = spawn(process.execPath, [path.join(root, 'background.mjs')], {
  cwd: root,
  detached: true,
  windowsHide: true,
  stdio: 'ignore'
});
p.unref();
