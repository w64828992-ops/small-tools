'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class SettingsStore {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'settings.json');
    this.data = this._load();
  }

  _load() {
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      existing = {};
    }
    const deviceId = typeof existing.deviceId === 'string' && existing.deviceId.length > 10
      ? existing.deviceId
      : crypto.randomUUID();
    const deviceName = typeof existing.deviceName === 'string' && existing.deviceName.trim()
      ? existing.deviceName.trim().slice(0, 64)
      : os.hostname().slice(0, 64);
    const value = { deviceId, deviceName };
    this._save(value);
    return value;
  }

  _save(value = this.data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
  }

  get() {
    return { ...this.data };
  }

  setDeviceName(name) {
    const clean = String(name || '').trim().replace(/[\r\n\t]/g, ' ').slice(0, 64);
    if (!clean) throw new Error('电脑名称不能为空');
    this.data.deviceName = clean;
    this._save();
    return this.get();
  }
}

module.exports = { SettingsStore };
