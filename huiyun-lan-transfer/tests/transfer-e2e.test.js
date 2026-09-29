'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { TransferServer, sendTransfer } = require('../src/transfer');

function wrongTokenRequest(port) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from('{}');
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/offer',
      headers: {
        'x-hy-token': 'wrong-token',
        'content-type': 'application/json',
        'content-length': body.length,
      },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('HTTP server rejects a wrong capability token', async () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const server = new TransferServer({ token, deviceId: 'receiver', deviceName: 'Receiver', platform: process.platform });
  await server.start();
  try {
    assert.equal(await wrongTokenRequest(server.port), 403);
  } finally {
    await server.stop();
  }
});

test('localhost end-to-end transfer sends a file and a folder', async () => {
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'huiyun-e2e-'));
  const sourceRoot = path.join(temp, 'send');
  const destination = path.join(temp, 'receive');
  await fs.promises.mkdir(sourceRoot);
  await fs.promises.mkdir(destination);

  const folder = path.join(sourceRoot, 'docs');
  const singleFile = path.join(sourceRoot, 'note.txt');
  await fs.promises.mkdir(path.join(folder, 'empty'), { recursive: true });
  await fs.promises.writeFile(path.join(folder, 'a.txt'), 'alpha');
  await fs.promises.writeFile(path.join(folder, 'b.bin'), Buffer.alloc(256 * 1024, 7));
  await fs.promises.writeFile(singleFile, 'single');

  const token = crypto.randomBytes(32).toString('base64url');
  const server = new TransferServer({ token, deviceId: 'receiver', deviceName: 'Receiver', platform: process.platform });
  await server.start();
  server.on('incoming-offer', (offer) => {
    server.acceptOffer(offer.id, destination).catch((error) => {
      throw error;
    });
  });

  const events = [];
  try {
    await sendTransfer(
      { id: 'receiver', name: 'Receiver', address: '127.0.0.1', port: server.port, token },
      [folder, singleFile],
      { id: 'sender', name: 'Sender' },
      (event) => events.push(event)
    );

    assert.equal(await fs.promises.readFile(path.join(destination, 'docs', 'a.txt'), 'utf8'), 'alpha');
    assert.deepEqual(
      await fs.promises.readFile(path.join(destination, 'docs', 'b.bin')),
      Buffer.alloc(256 * 1024, 7)
    );
    assert.equal(await fs.promises.readFile(path.join(destination, 'note.txt'), 'utf8'), 'single');
    assert.equal((await fs.promises.stat(path.join(destination, 'docs', 'empty'))).isDirectory(), true);
    assert.ok(events.some((event) => event.phase === 'waiting'));
    assert.ok(events.some((event) => event.phase === 'sending'));
    assert.ok(events.some((event) => event.phase === 'completed'));
  } finally {
    await server.stop();
    await fs.promises.rm(temp, { recursive: true, force: true });
  }
});
