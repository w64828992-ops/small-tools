'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { pipeline } = require('stream/promises');
const {
  normalizeRelativePath,
  safeJoin,
  uniqueTopLevelName,
  mapRelativePath,
  assertPathSupportedOnPlatform,
} = require('./path-utils');
const { isLanAddress } = require('./network-utils');

const OFFER_TTL_MS = 10 * 60 * 1000;
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_MANIFEST_FILES = 100000;
const UPLOAD_CONCURRENCY = 4;

function jsonResponse(res, statusCode, body) {
  const data = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
  });
  res.end(data);
}

async function readJsonBody(req, maxBytes = MAX_JSON_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function secureTokenEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validateManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid manifest');
  if (!Array.isArray(raw.files) || !Array.isArray(raw.dirs)) throw new Error('Invalid manifest arrays');
  if (raw.files.length > MAX_MANIFEST_FILES) throw new Error('Too many files');

  const files = [];
  const seenFiles = new Set();
  for (const file of raw.files) {
    if (!file || typeof file !== 'object') throw new Error('Invalid file entry');
    const relPath = normalizeRelativePath(file.relPath);
    const size = Number(file.size);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid file size');
    if (seenFiles.has(relPath)) throw new Error('Duplicate file path');
    seenFiles.add(relPath);
    files.push({ relPath, size });
  }

  const dirs = [];
  const seenDirs = new Set();
  for (const rawDir of raw.dirs) {
    const relPath = normalizeRelativePath(typeof rawDir === 'string' ? rawDir : rawDir.relPath);
    if (!seenDirs.has(relPath)) {
      seenDirs.add(relPath);
      dirs.push(relPath);
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return {
    files,
    dirs,
    totalBytes,
    fileCount: files.length,
    dirCount: dirs.length,
    skippedSymlinks: Number.isSafeInteger(raw.skippedSymlinks) ? raw.skippedSymlinks : 0,
    items: Array.isArray(raw.items) ? raw.items.slice(0, 1000) : [],
  };
}

function publicOffer(offer) {
  return {
    id: offer.id,
    sender: { ...offer.sender },
    status: offer.status,
    totalBytes: offer.manifest.totalBytes,
    fileCount: offer.manifest.fileCount,
    dirCount: offer.manifest.dirCount,
    skippedSymlinks: offer.manifest.skippedSymlinks,
    receivedBytes: offer.receivedBytes,
    createdAt: offer.createdAt,
    expiresAt: offer.expiresAt,
    error: offer.error || null,
  };
}

class TransferServer extends EventEmitter {
  constructor(options) {
    super();
    this.token = options.token;
    this.deviceId = options.deviceId;
    this.deviceName = options.deviceName;
    this.platform = options.platform || process.platform;
    this.offers = new Map();
    this.server = null;
    this.port = null;
    this.cleanupTimer = null;
  }

  updateDeviceName(name) {
    this.deviceName = name;
  }

  async start() {
    if (this.server) return this.port;
    this.server = http.createServer((req, res) => {
      this._handle(req, res).catch((error) => {
        if (!res.headersSent) jsonResponse(res, 500, { error: error.message || 'Server error' });
        else res.destroy();
      });
    });
    this.server.keepAliveTimeout = 15000;
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '0.0.0.0', () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    this.cleanupTimer = setInterval(() => this._expireOffers(), 5000);
    return this.port;
  }

  async stop() {
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    await new Promise((resolve) => server.close(() => resolve()));
  }

  listOffers() {
    return [...this.offers.values()].map(publicOffer);
  }

  getOffer(id) {
    const offer = this.offers.get(id);
    return offer ? publicOffer(offer) : null;
  }

  async acceptOffer(id, baseDir) {
    const offer = this.offers.get(id);
    if (!offer || offer.status !== 'pending') throw new Error('该传输请求已失效或已处理');
    if (!baseDir || !fs.existsSync(baseDir)) throw new Error('请选择有效保存位置');

    for (const dir of offer.manifest.dirs) assertPathSupportedOnPlatform(dir, this.platform);
    for (const file of offer.manifest.files) assertPathSupportedOnPlatform(file.relPath, this.platform);

    const roots = new Map();
    for (const dir of offer.manifest.dirs) {
      const root = dir.split('/')[0];
      if (!roots.has(root)) roots.set(root, true);
    }
    for (const file of offer.manifest.files) {
      const root = file.relPath.split('/')[0];
      if (!roots.has(root)) roots.set(root, file.relPath.includes('/'));
    }

    const reserved = new Set();
    const rootMap = new Map();
    for (const [root, isDirectory] of roots) {
      rootMap.set(root, uniqueTopLevelName(baseDir, root, isDirectory, reserved));
    }

    offer.saveBase = baseDir;
    offer.rootMap = rootMap;
    offer.expectedFiles = new Map(offer.manifest.files.map((file) => [file.relPath, file.size]));
    offer.receivedFiles = new Set();
    offer.activeFiles = new Set();

    const sortedDirs = [...offer.manifest.dirs].sort((a, b) => a.split('/').length - b.split('/').length);
    for (const dir of sortedDirs) {
      const mapped = mapRelativePath(dir, rootMap);
      await fs.promises.mkdir(safeJoin(baseDir, mapped), { recursive: true });
    }

    offer.status = 'accepted';
    offer.acceptedAt = Date.now();
    this.emit('offer-updated', publicOffer(offer));
    return publicOffer(offer);
  }

  rejectOffer(id) {
    const offer = this.offers.get(id);
    if (!offer || offer.status !== 'pending') throw new Error('该传输请求已失效或已处理');
    offer.status = 'rejected';
    this.emit('offer-updated', publicOffer(offer));
    return publicOffer(offer);
  }

  async _handle(req, res) {
    if (!isLanAddress(req.socket.remoteAddress)) {
      jsonResponse(res, 403, { error: 'LAN sources only' });
      return;
    }
    if (!secureTokenEquals(String(req.headers['x-hy-token'] || ''), this.token)) {
      jsonResponse(res, 403, { error: 'Invalid token' });
      return;
    }

    const url = new URL(req.url, 'http://lan.local');
    if (req.method === 'POST' && url.pathname === '/api/offer') {
      await this._handleOffer(req, res);
      return;
    }

    const statusMatch = url.pathname.match(/^\/api\/offer\/([^/]+)\/status$/);
    if (req.method === 'GET' && statusMatch) {
      const offer = this.offers.get(decodeURIComponent(statusMatch[1]));
      if (!offer) return jsonResponse(res, 404, { error: 'Offer not found' });
      return jsonResponse(res, 200, publicOffer(offer));
    }

    const fileMatch = url.pathname.match(/^\/api\/transfer\/([^/]+)\/file$/);
    if (req.method === 'POST' && fileMatch) {
      await this._handleFile(req, res, decodeURIComponent(fileMatch[1]));
      return;
    }

    const completeMatch = url.pathname.match(/^\/api\/transfer\/([^/]+)\/complete$/);
    if (req.method === 'POST' && completeMatch) {
      await this._handleComplete(res, decodeURIComponent(completeMatch[1]));
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  }

  async _handleOffer(req, res) {
    const body = await readJsonBody(req);
    const id = String(body.transferId || '');
    if (!/^[A-Za-z0-9-]{16,80}$/.test(id)) return jsonResponse(res, 400, { error: 'Invalid transfer id' });
    if (this.offers.has(id)) return jsonResponse(res, 200, publicOffer(this.offers.get(id)));

    const sender = {
      id: String(body.sender && body.sender.id || '').slice(0, 128),
      name: String(body.sender && body.sender.name || '未知电脑').trim().slice(0, 64) || '未知电脑',
      address: req.socket.remoteAddress,
    };
    const manifest = validateManifest(body.manifest);
    if (manifest.files.length === 0 && manifest.dirs.length === 0) {
      return jsonResponse(res, 400, { error: 'Empty transfer' });
    }

    const now = Date.now();
    const offer = {
      id,
      sender,
      manifest,
      status: 'pending',
      receivedBytes: 0,
      createdAt: now,
      expiresAt: now + OFFER_TTL_MS,
      error: null,
      lastProgressEvent: 0,
    };
    this.offers.set(id, offer);
    this.emit('incoming-offer', publicOffer(offer));
    jsonResponse(res, 202, publicOffer(offer));
  }

  async _handleFile(req, res, id) {
    const offer = this.offers.get(id);
    if (!offer) return jsonResponse(res, 404, { error: 'Offer not found' });
    if (!['accepted', 'receiving'].includes(offer.status)) {
      return jsonResponse(res, 409, { error: 'Transfer is not accepted' });
    }

    let relPath;
    try {
      relPath = Buffer.from(String(req.headers['x-hy-path-b64'] || ''), 'base64url').toString('utf8');
      relPath = normalizeRelativePath(relPath);
    } catch {
      return jsonResponse(res, 400, { error: 'Invalid file path' });
    }

    const expectedSize = offer.expectedFiles.get(relPath);
    if (expectedSize === undefined) return jsonResponse(res, 403, { error: 'File is not in manifest' });
    if (offer.receivedFiles.has(relPath) || offer.activeFiles.has(relPath)) {
      return jsonResponse(res, 409, { error: 'Duplicate file upload' });
    }

    const contentLength = Number(req.headers['content-length']);
    if (!Number.isSafeInteger(contentLength) || contentLength !== expectedSize) {
      return jsonResponse(res, 400, { error: 'Content-Length does not match manifest' });
    }

    const mapped = mapRelativePath(relPath, offer.rootMap);
    const target = safeJoin(offer.saveBase, mapped);
    const temp = target + '.huiyun-part-' + offer.id.slice(0, 8);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.rm(temp, { force: true }).catch(() => {});

    offer.activeFiles.add(relPath);
    offer.status = 'receiving';
    this.emit('offer-updated', publicOffer(offer));

    let receivedThisFile = 0;
    const output = fs.createWriteStream(temp, { flags: 'wx' });
    const onData = (chunk) => {
      receivedThisFile += chunk.length;
      offer.receivedBytes += chunk.length;
      const now = Date.now();
      if (now - offer.lastProgressEvent > 100) {
        offer.lastProgressEvent = now;
        this.emit('receive-progress', publicOffer(offer));
      }
    };
    req.on('data', onData);

    try {
      await pipeline(req, output);
      if (receivedThisFile !== expectedSize) throw new Error('Received byte count mismatch');
      await fs.promises.rename(temp, target);
      offer.receivedFiles.add(relPath);
      offer.activeFiles.delete(relPath);
      this.emit('receive-progress', publicOffer(offer));
      jsonResponse(res, 200, { ok: true });
    } catch (error) {
      offer.activeFiles.delete(relPath);
      offer.receivedBytes = Math.max(0, offer.receivedBytes - receivedThisFile);
      offer.status = 'error';
      offer.error = error.message || 'File write failed';
      await fs.promises.rm(temp, { force: true }).catch(() => {});
      this.emit('offer-updated', publicOffer(offer));
      if (!res.headersSent) jsonResponse(res, 500, { error: offer.error });
    } finally {
      req.off('data', onData);
    }
  }

  async _handleComplete(res, id) {
    const offer = this.offers.get(id);
    if (!offer) return jsonResponse(res, 404, { error: 'Offer not found' });
    if (!['accepted', 'receiving'].includes(offer.status)) {
      return jsonResponse(res, 409, { error: 'Transfer is not active' });
    }
    if (offer.activeFiles.size !== 0 || offer.receivedFiles.size !== offer.expectedFiles.size) {
      return jsonResponse(res, 409, { error: 'Not all expected files were received' });
    }
    offer.status = 'completed';
    offer.completedAt = Date.now();
    this.emit('offer-updated', publicOffer(offer));
    jsonResponse(res, 200, publicOffer(offer));
  }

  _expireOffers() {
    const now = Date.now();
    for (const offer of this.offers.values()) {
      if (offer.status === 'pending' && offer.expiresAt <= now) {
        offer.status = 'expired';
        this.emit('offer-updated', publicOffer(offer));
      }
    }
  }
}

function virtualRootName(name, reserved) {
  const base = String(name || '').trim();
  if (!base || base.includes('/') || base.includes('\\') || base === '.' || base === '..') {
    throw new Error('不支持的文件名: ' + base);
  }
  const ext = path.extname(base);
  const stem = ext && ext !== base ? base.slice(0, -ext.length) : base;
  const suffix = ext && ext !== base ? ext : '';
  for (let index = 0; index < 10000; index += 1) {
    const candidate = index === 0 ? base : stem + ' (' + index + ')' + suffix;
    if (!reserved.has(candidate.toLowerCase())) {
      reserved.add(candidate.toLowerCase());
      return candidate;
    }
  }
  throw new Error('文件名冲突过多');
}

async function scanPaths(inputPaths) {
  const paths = [...new Set((inputPaths || []).map((value) => path.resolve(value)))];
  if (paths.length === 0) throw new Error('请选择文件或文件夹');

  const files = [];
  const dirs = [];
  const items = [];
  const reservedRoots = new Set();
  let totalBytes = 0;
  let skippedSymlinks = 0;

  async function walk(absPath, relPath, itemStats) {
    const stat = await fs.promises.lstat(absPath);
    if (stat.isSymbolicLink()) {
      skippedSymlinks += 1;
      itemStats.skippedSymlinks += 1;
      return;
    }
    if (stat.isDirectory()) {
      dirs.push(relPath);
      itemStats.dirCount += 1;
      const children = await fs.promises.readdir(absPath, { withFileTypes: true });
      for (const child of children) {
        if (child.name.includes('\\') || child.name.includes('/') || child.name.includes('\0')) {
          throw new Error('当前版本不支持该文件名: ' + child.name);
        }
        await walk(path.join(absPath, child.name), relPath + '/' + child.name, itemStats);
      }
      return;
    }
    if (stat.isFile()) {
      files.push({ absPath, relPath, size: stat.size });
      totalBytes += stat.size;
      itemStats.size += stat.size;
      itemStats.fileCount += 1;
    }
  }

  for (const absPath of paths) {
    const stat = await fs.promises.lstat(absPath);
    if (stat.isSymbolicLink()) {
      skippedSymlinks += 1;
      continue;
    }
    const base = path.basename(absPath);
    const root = virtualRootName(base, reservedRoots);
    const itemStats = {
      name: root,
      type: stat.isDirectory() ? 'folder' : 'file',
      size: 0,
      fileCount: 0,
      dirCount: 0,
      skippedSymlinks: 0,
    };
    await walk(absPath, root, itemStats);
    items.push(itemStats);
  }

  if (files.length === 0 && dirs.length === 0) throw new Error('没有可发送的文件');
  return {
    files,
    dirs,
    items,
    totalBytes,
    fileCount: files.length,
    dirCount: dirs.length,
    skippedSymlinks,
  };
}

function networkManifest(scan) {
  return {
    files: scan.files.map((file) => ({ relPath: file.relPath, size: file.size })),
    dirs: scan.dirs,
    items: scan.items,
    totalBytes: scan.totalBytes,
    fileCount: scan.fileCount,
    dirCount: scan.dirCount,
    skippedSymlinks: scan.skippedSymlinks,
  };
}

function requestJson(peer, method, requestPath, body, agent, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const headers = {
      'x-hy-token': peer.token,
      'accept': 'application/json',
    };
    if (payload) {
      headers['content-type'] = 'application/json; charset=utf-8';
      headers['content-length'] = payload.length;
    }
    const req = http.request({
      hostname: peer.address,
      port: peer.port,
      method,
      path: requestPath,
      headers,
      agent,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let parsed = {};
        try {
          parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(parsed.error || ('HTTP ' + res.statusCode)));
      });
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
    if (payload) req.end(payload);
    else req.end();
  });
}

function uploadFile(peer, transferId, file, agent, onBytes) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: peer.address,
      port: peer.port,
      method: 'POST',
      path: '/api/transfer/' + encodeURIComponent(transferId) + '/file',
      headers: {
        'x-hy-token': peer.token,
        'x-hy-path-b64': Buffer.from(file.relPath, 'utf8').toString('base64url'),
        'content-type': 'application/octet-stream',
        'content-length': file.size,
      },
      agent,
      timeout: 120000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let parsed = {};
        try { parsed = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(parsed.error || ('上传失败 HTTP ' + res.statusCode)));
      });
    });
    req.on('timeout', () => req.destroy(new Error('上传超时')));
    req.on('error', reject);

    const input = fs.createReadStream(file.absPath, { highWaterMark: 1024 * 1024 });
    input.on('data', (chunk) => onBytes(chunk.length));
    input.on('error', (error) => req.destroy(error));
    input.pipe(req);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTransfer(peer, inputPaths, sender, onEvent = () => {}) {
  const scan = await scanPaths(inputPaths);
  const transferId = crypto.randomUUID();
  const manifest = networkManifest(scan);
  const startedAt = Date.now();
  let sentBytes = 0;
  let lastProgress = 0;
  const agent = new http.Agent({ keepAlive: true, maxSockets: UPLOAD_CONCURRENCY });

  const emitProgress = (phase, extra = {}) => {
    const now = Date.now();
    if (phase === 'sending' && now - lastProgress < 100 && sentBytes < scan.totalBytes) return;
    lastProgress = now;
    const elapsedSeconds = Math.max((now - startedAt) / 1000, 0.001);
    onEvent({
      id: transferId,
      phase,
      peer: { id: peer.id, name: peer.name, address: peer.address },
      totalBytes: scan.totalBytes,
      sentBytes,
      fileCount: scan.fileCount,
      dirCount: scan.dirCount,
      skippedSymlinks: scan.skippedSymlinks,
      bytesPerSecond: sentBytes / elapsedSeconds,
      ...extra,
    });
  };

  try {
    emitProgress('offering');
    await requestJson(peer, 'POST', '/api/offer', {
      transferId,
      sender: { id: sender.id, name: sender.name },
      manifest,
    }, agent);

    emitProgress('waiting');
    const deadline = Date.now() + OFFER_TTL_MS;
    while (Date.now() < deadline) {
      const status = await requestJson(peer, 'GET', '/api/offer/' + encodeURIComponent(transferId) + '/status', undefined, agent);
      if (status.status === 'accepted' || status.status === 'receiving') break;
      if (['rejected', 'expired', 'error'].includes(status.status)) {
        throw new Error(status.status === 'rejected' ? '对方已拒绝接收' : (status.error || '传输请求已失效'));
      }
      await sleep(500);
    }
    if (Date.now() >= deadline) throw new Error('等待对方接收超时');

    emitProgress('sending');
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= scan.files.length) return;
        const file = scan.files[index];
        await uploadFile(peer, transferId, file, agent, (count) => {
          sentBytes += count;
          emitProgress('sending', { currentFile: file.relPath });
        });
      }
    };
    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, Math.max(1, scan.files.length)) }, () => worker());
    await Promise.all(workers);

    await requestJson(peer, 'POST', '/api/transfer/' + encodeURIComponent(transferId) + '/complete', {}, agent);
    emitProgress('completed');
    return { id: transferId, scan };
  } catch (error) {
    emitProgress('error', { error: error.message || '传输失败' });
    // Tell the Electron integration that the transfer-specific error event is already visible.
    error.huiyunTransferEventEmitted = true;
    throw error;
  } finally {
    agent.destroy();
  }
}

module.exports = {
  TransferServer,
  scanPaths,
  networkManifest,
  sendTransfer,
  validateManifest,
  OFFER_TTL_MS,
  UPLOAD_CONCURRENCY,
};
