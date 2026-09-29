'use strict';

const dgram = require('dgram');
const os = require('os');
const { EventEmitter } = require('events');
const { isLanAddress, subnetBroadcast } = require('./network-utils');

const DISCOVERY_PORT = 45871;
const MAGIC = 'huiyun-lan-transfer/1';
const PEER_TTL_MS = 9000;
const BEACON_INTERVAL_MS = 1800;

class DiscoveryService extends EventEmitter {
  constructor(identityProvider) {
    super();
    this.identityProvider = identityProvider;
    this.socket = null;
    this.timer = null;
    this.pruneTimer = null;
    this.peers = new Map();
  }

  start() {
    if (this.socket) return;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('message', (message, rinfo) => this._onMessage(message, rinfo));
    this.socket.on('error', (error) => this.emit('error', error));
    this.socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
      try { this.socket.setBroadcast(true); } catch {}
      this._broadcast();
      this.timer = setInterval(() => this._broadcast(), BEACON_INTERVAL_MS);
      this.pruneTimer = setInterval(() => this._prune(), 2000);
    });
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.pruneTimer);
    this.timer = null;
    this.pruneTimer = null;
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = null;
    }
    this.peers.clear();
  }

  getPeers() {
    return [...this.peers.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((peer) => ({ ...peer }));
  }

  _broadcastTargets() {
    const targets = new Set(['255.255.255.255']);
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries || []) {
        if (entry.family !== 'IPv4' || entry.internal || !entry.address || !entry.netmask) continue;
        const address = subnetBroadcast(entry.address, entry.netmask);
        if (address) targets.add(address);
      }
    }
    return [...targets];
  }

  _broadcast() {
    if (!this.socket) return;
    const identity = this.identityProvider();
    if (!identity || !identity.port || !identity.token) return;
    const payload = Buffer.from(JSON.stringify({
      magic: MAGIC,
      id: identity.id,
      name: identity.name,
      port: identity.port,
      token: identity.token,
      platform: process.platform,
      version: identity.version || '1.0.0',
    }), 'utf8');

    for (const target of this._broadcastTargets()) {
      this.socket.send(payload, 0, payload.length, DISCOVERY_PORT, target, () => {});
    }
  }

  _onMessage(message, rinfo) {
    if (!isLanAddress(rinfo.address)) return;
    let beacon;
    try {
      if (message.length > 2048) return;
      beacon = JSON.parse(message.toString('utf8'));
    } catch {
      return;
    }

    const self = this.identityProvider();
    if (!beacon || beacon.magic !== MAGIC || beacon.id === self.id) return;
    if (typeof beacon.id !== 'string' || typeof beacon.name !== 'string' || typeof beacon.token !== 'string') return;
    if (!Number.isInteger(beacon.port) || beacon.port < 1 || beacon.port > 65535) return;
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(beacon.token)) return;

    const peer = {
      id: beacon.id.slice(0, 128),
      name: beacon.name.trim().slice(0, 64) || '未命名电脑',
      address: rinfo.address,
      port: beacon.port,
      token: beacon.token,
      platform: String(beacon.platform || '').slice(0, 16),
      version: String(beacon.version || '').slice(0, 32),
      lastSeen: Date.now(),
    };
    this.peers.set(peer.id, peer);
    this.emit('peers', this.getPeers());
  }

  _prune() {
    const cutoff = Date.now() - PEER_TTL_MS;
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit('peers', this.getPeers());
  }
}

module.exports = { DiscoveryService, DISCOVERY_PORT, MAGIC };
