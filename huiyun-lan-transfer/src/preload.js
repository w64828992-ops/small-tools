'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('huiyun', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  setDeviceName: (name) => ipcRenderer.invoke('settings:set-device-name', name),
  selectFiles: () => ipcRenderer.invoke('dialog:select-files'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  sendPaths: (peerId, paths) => ipcRenderer.invoke('send:paths', peerId, paths),
  acceptIncoming: (transferId) => ipcRenderer.invoke('incoming:accept', transferId),
  rejectIncoming: (transferId) => ipcRenderer.invoke('incoming:reject', transferId),
  showWindow: () => ipcRenderer.invoke('window:show'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onPeersUpdated: (callback) => subscribe('peers-updated', callback),
  onIncomingOffer: (callback) => subscribe('incoming-offer', callback),
  onIncomingUpdated: (callback) => subscribe('incoming-updated', callback),
  onIncomingProgress: (callback) => subscribe('incoming-progress', callback),
  onSendEvent: (callback) => subscribe('send-event', callback),
  onIdentityUpdated: (callback) => subscribe('identity-updated', callback),
  onAppError: (callback) => subscribe('app-error', callback),
});
