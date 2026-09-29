'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanPaths } = require('../src/transfer');

test('manifest scan includes files and empty folders', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'huiyun-scan-'));
  const source = path.join(root, 'source');
  try {
    await fs.promises.mkdir(path.join(source, 'nested', 'empty'), { recursive: true });
    await fs.promises.writeFile(path.join(source, 'hello.txt'), 'hello');
    await fs.promises.writeFile(path.join(source, 'nested', 'world.txt'), 'world!');

    const scan = await scanPaths([source]);
    assert.equal(scan.fileCount, 2);
    assert.equal(scan.totalBytes, 11);
    assert.ok(scan.dirs.includes('source'));
    assert.ok(scan.dirs.includes('source/nested'));
    assert.ok(scan.dirs.includes('source/nested/empty'));
    assert.deepEqual(
      scan.files.map((file) => file.relPath).sort(),
      ['source/hello.txt', 'source/nested/world.txt']
    );
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('manifest scan skips symlinks when the platform allows creating them', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'huiyun-symlink-'));
  const source = path.join(root, 'source');
  try {
    await fs.promises.mkdir(source);
    await fs.promises.writeFile(path.join(source, 'real.txt'), 'real');
    try {
      await fs.promises.symlink(path.join(source, 'real.txt'), path.join(source, 'link.txt'), 'file');
    } catch (error) {
      t.skip('Symlink creation is not available in this environment: ' + error.code);
      return;
    }
    const scan = await scanPaths([source]);
    assert.equal(scan.fileCount, 1);
    assert.equal(scan.skippedSymlinks, 1);
    assert.deepEqual(scan.files.map((file) => file.relPath), ['source/real.txt']);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
