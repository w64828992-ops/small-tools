'use strict';

const path = require('path');
const crypto = require('crypto');
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  Notification,
  nativeImage,
} = require('electron');
const { SettingsStore } = require('./settings');
const { DiscoveryService } = require('./discovery');
const { TransferServer, sendTransfer } = require('./transfer');

const APP_TITLE = '汇云局域网跨传';
const APP_VERSION = require('../package.json').version;
const iconPath = path.join(__dirname, '..', 'build', 'icon.png');

let mainWindow = null;
let tray = null;
let settings = null;
let transferServer = null;
let discovery = null;
let isQuitting = false;
let bounceId = null;
let capabilityToken = null;

function currentIdentity() {
  const data = settings.get();
  return {
    id: data.deviceId,
    name: data.deviceName,
    port: transferServer ? transferServer.port : null,
    token: capabilityToken,
    version: APP_VERSION,
  };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function stopAttention() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.flashFrame(false);
  mainWindow.setTitle(APP_TITLE);
  if (process.platform === 'darwin' && bounceId !== null && app.dock) {
    app.dock.cancelBounce(bounceId);
    bounceId = null;
  }
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  stopAttention();
}

function notifyIncoming(offer) {
  const senderName = offer.sender && offer.sender.name ? offer.sender.name : '未知电脑';
  if (mainWindow) {
    mainWindow.setTitle('【' + senderName + ' 发来文件】' + APP_TITLE);
    if (process.platform === 'win32') mainWindow.flashFrame(true);
  }
  if (process.platform === 'darwin' && app.dock) {
    bounceId = app.dock.bounce('critical');
  }
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: senderName + ' 发来文件',
      body: '点击打开 ' + APP_TITLE + '，选择保存位置后开始接收。',
      icon: iconPath,
      silent: false,
    });
    notification.on('click', showMainWindow);
    notification.show();
  }
  sendToRenderer('incoming-offer', offer);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    title: APP_TITLE,
    icon: iconPath,
    show: false,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('focus', stopAttention);

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    if (process.platform === 'darwin') {
      mainWindow.hide();
    } else {
      // Keep the Windows taskbar button alive so flashFrame can draw attention.
      mainWindow.minimize();
    }
  });
}

function createTray() {
  const image = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip(APP_TITLE);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开', click: showMainWindow },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
  tray.on('double-click', showMainWindow);
}

function installIpcHandlers() {
  ipcMain.handle('app:get-state', () => ({
    appName: APP_TITLE,
    version: APP_VERSION,
    identity: currentIdentity(),
    peers: discovery ? discovery.getPeers() : [],
    incoming: transferServer ? transferServer.listOffers().filter((offer) => offer.status !== 'completed') : [],
  }));

  ipcMain.handle('settings:set-device-name', (_event, name) => {
    const value = settings.setDeviceName(name);
    transferServer.updateDeviceName(value.deviceName);
    sendToRenderer('identity-updated', currentIdentity());
    return currentIdentity();
  });

  ipcMain.handle('dialog:select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要发送的文件',
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择要发送的文件夹',
      properties: ['openDirectory'],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('send:paths', (_event, peerId, filePaths) => {
    const peer = discovery.getPeers().find((item) => item.id === peerId);
    if (!peer) throw new Error('目标电脑已离线，请重新选择');
    if (!Array.isArray(filePaths) || filePaths.length === 0) throw new Error('请选择文件或文件夹');

    const sender = settings.get();
    sendTransfer(peer, filePaths, { id: sender.deviceId, name: sender.deviceName }, (event) => {
      sendToRenderer('send-event', event);
    }).catch((error) => {
      if (error.huiyunTransferEventEmitted) return;
      sendToRenderer('send-event', {
        id: 'local-' + Date.now(),
        phase: 'error',
        peer: { id: peer.id, name: peer.name, address: peer.address },
        error: error.message || '发送失败',
        sentBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
      });
    });
    return { started: true };
  });

  ipcMain.handle('incoming:accept', async (_event, transferId) => {
    const offer = transferServer.getOffer(transferId);
    if (!offer || offer.status !== 'pending') throw new Error('该请求已处理或失效');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择保存位置',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '保存到这里',
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    stopAttention();
    const updated = await transferServer.acceptOffer(transferId, result.filePaths[0]);
    return { canceled: false, offer: updated, savePath: result.filePaths[0] };
  });

  ipcMain.handle('incoming:reject', (_event, transferId) => {
    stopAttention();
    return transferServer.rejectOffer(transferId);
  });

  ipcMain.handle('window:show', () => {
    showMainWindow();
    return true;
  });
}

async function startServices() {
  settings = new SettingsStore(app.getPath('userData'));
  capabilityToken = crypto.randomBytes(32).toString('base64url');

  transferServer = new TransferServer({
    token: capabilityToken,
    deviceId: settings.get().deviceId,
    deviceName: settings.get().deviceName,
  });
  await transferServer.start();

  transferServer.on('incoming-offer', notifyIncoming);
  transferServer.on('offer-updated', (offer) => {
    sendToRenderer('incoming-updated', offer);
    if (offer.status === 'completed') {
      if (Notification.isSupported()) {
        new Notification({
          title: '接收完成',
          body: '已接收来自 ' + offer.sender.name + ' 的文件。',
          icon: iconPath,
        }).show();
      }
      stopAttention();
    }
  });
  transferServer.on('receive-progress', (offer) => sendToRenderer('incoming-progress', offer));

  discovery = new DiscoveryService(currentIdentity);
  discovery.on('peers', (peers) => sendToRenderer('peers-updated', peers));
  discovery.on('error', (error) => sendToRenderer('app-error', { message: error.message }));
  discovery.start();
}

async function stopServices() {
  if (discovery) discovery.stop();
  discovery = null;
  if (transferServer) await transferServer.stop().catch(() => {});
  transferServer = null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('com.huiyun.lantransfer');
    createWindow();
    createTray();
    installIpcHandlers();
    await startServices();
    sendToRenderer('identity-updated', currentIdentity());
  }).catch((error) => {
    dialog.showErrorBox(APP_TITLE, error.message || String(error));
    app.quit();
  });

  app.on('activate', showMainWindow);

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', (event) => {
    if (transferServer) {
      event.preventDefault();
      stopServices().finally(() => {
        transferServer = null;
        app.exit(0);
      });
    }
  });

  app.on('window-all-closed', () => {
    // Keep the background receiver alive until the user explicitly chooses Quit.
  });
}
