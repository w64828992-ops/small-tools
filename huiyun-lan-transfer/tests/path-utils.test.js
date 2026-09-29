'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normalizeRelativePath,
  safeJoin,
  uniqueTopLevelName,
} = require('../src/path-utils');
const { isLanAddress } = require('../src/network-utils');

test('LAN address detection accepts private/local ranges and rejects public IPs', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.8.9',
    '172.31.255.254',
    '192.168.10.20',
    '169.254.2.3',
    '::1',
    'fe80::1234',
    'fd12:3456::1',
    '::ffff:192.168.1.8',
  ]) {
    assert.equal(isLanAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2001:4860:4860::8888']) {
    assert.equal(isLanAddress(address), false, address);
  }
});

test('relative path validation rejects traversal and absolute paths', () => {
  for (const value of [
    '../secret.txt',
    'folder/../secret.txt',
    '/etc/passwd',
    'C:\\Windows\\system.ini',
    '\\\\server\\share\\file.txt',
    'a//b.txt',
    'a/./b.txt',
    'a\0b.txt',
  ]) {
    assert.throws(() => normalizeRelativePath(value), undefined, value);
  }
  assert.equal(normalizeRelativePath('folder/sub/file.txt'), 'folder/sub/file.txt');
});

test('safeJoin never escapes the destination', () => {
  const root = path.join(os.tmpdir(), 'huiyun-safe-root');
  assert.equal(safeJoin(root, 'folder/file.txt'), path.resolve(root, 'folder', 'file.txt'));
  assert.throws(() => safeJoin(root, '../outside.txt'));
});

test('top-level collisions are renamed instead of overwritten', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'huiyun-collision-'));
  try {
    fs.writeFileSync(path.join(root, 'report.txt'), 'old');
    fs.mkdirSync(path.join(root, 'photos'));
    const reserved = new Set();
    assert.equal(uniqueTopLevelName(root, 'report.txt', false, reserved), 'report (1).txt');
    assert.equal(uniqueTopLevelName(root, 'photos', true, reserved), 'photos (1)');
    fs.writeFileSync(path.join(root, 'report (1).txt'), 'old2');
    assert.equal(uniqueTopLevelName(root, 'report.txt', false, new Set()), 'report (2).txt');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
