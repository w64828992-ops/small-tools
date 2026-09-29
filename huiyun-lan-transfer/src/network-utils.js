'use strict';

const net = require('net');

function normalizeRemoteAddress(address) {
  if (!address) return '';
  let value = String(address).trim().toLowerCase();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  const zone = value.indexOf('%');
  if (zone !== -1) value = value.slice(0, zone);
  return value;
}

function ipv4ToInt(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function isLanAddress(address) {
  const value = normalizeRemoteAddress(address);
  if (!value) return false;
  if (value === '::1' || value === 'localhost') return true;

  if (net.isIPv4(value)) {
    const ip = ipv4ToInt(value);
    if (ip === null) return false;
    const inRange = (base, mask) => (ip & mask) === (base & mask);
    return (
      inRange(ipv4ToInt('10.0.0.0'), 0xff000000) ||
      inRange(ipv4ToInt('172.16.0.0'), 0xfff00000) ||
      inRange(ipv4ToInt('192.168.0.0'), 0xffff0000) ||
      inRange(ipv4ToInt('169.254.0.0'), 0xffff0000) ||
      inRange(ipv4ToInt('127.0.0.0'), 0xff000000)
    );
  }

  if (net.isIPv6(value)) {
    return value === '::1' || value.startsWith('fe8') || value.startsWith('fe9') ||
      value.startsWith('fea') || value.startsWith('feb') || value.startsWith('fc') || value.startsWith('fd');
  }
  return false;
}

function subnetBroadcast(address, netmask) {
  const ip = ipv4ToInt(address);
  const mask = ipv4ToInt(netmask);
  if (ip === null || mask === null) return null;
  const result = ((ip & mask) | (~mask >>> 0)) >>> 0;
  return [24, 16, 8, 0].map((shift) => (result >>> shift) & 255).join('.');
}

module.exports = { normalizeRemoteAddress, isLanAddress, subnetBroadcast };
