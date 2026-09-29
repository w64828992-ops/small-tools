'use strict';

const fs = require('fs');
const path = require('path');

function normalizeRelativePath(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > 4096) {
    throw new Error('Invalid relative path');
  }
  if (input.includes('\0')) throw new Error('NUL is not allowed in paths');

  const normalized = input.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.startsWith('//') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('Absolute paths are not allowed');
  }

  const parts = normalized.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('Path traversal or empty segments are not allowed');
  }
  return parts.join('/');
}

function safeJoin(baseDir, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const root = path.resolve(baseDir);
  const target = path.resolve(root, ...normalized.split('/'));
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Resolved path escaped the destination');
  }
  return target;
}

function splitNameForSuffix(name, isDirectory) {
  if (isDirectory) return { stem: name, ext: '' };
  const ext = path.extname(name);
  if (!ext || ext === name) return { stem: name, ext: '' };
  return { stem: name.slice(0, -ext.length), ext };
}

function uniqueTopLevelName(baseDir, name, isDirectory, reserved = new Set()) {
  const clean = normalizeRelativePath(name);
  if (clean.includes('/')) throw new Error('Top-level name must be a single segment');

  const { stem, ext } = splitNameForSuffix(clean, isDirectory);
  for (let index = 0; index < 10000; index += 1) {
    const candidate = index === 0 ? clean : stem + ' (' + index + ')' + ext;
    const key = candidate.toLowerCase();
    if (!reserved.has(key) && !fs.existsSync(path.join(baseDir, candidate))) {
      reserved.add(key);
      return candidate;
    }
  }
  throw new Error('Unable to allocate a unique destination name');
}

function mapRelativePath(relativePath, rootMap) {
  const normalized = normalizeRelativePath(relativePath);
  const parts = normalized.split('/');
  const mappedRoot = rootMap.get(parts[0]);
  if (!mappedRoot) throw new Error('Unknown top-level path');
  return [mappedRoot, ...parts.slice(1)].join('/');
}

function assertPathSupportedOnPlatform(relativePath, platform = process.platform) {
  const normalized = normalizeRelativePath(relativePath);
  if (platform !== 'win32') return normalized;

  const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  for (const segment of normalized.split('/')) {
    if (/[<>:"|?*\x00-\x1F]/.test(segment) || /[. ]$/.test(segment) || reservedNames.test(segment)) {
      throw new Error('A filename is not supported by Windows: ' + segment);
    }
  }
  return normalized;
}

module.exports = {
  normalizeRelativePath,
  safeJoin,
  uniqueTopLevelName,
  mapRelativePath,
  assertPathSupportedOnPlatform,
};
