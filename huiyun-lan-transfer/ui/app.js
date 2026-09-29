'use strict';

const invoke = window.__TAURI__.core.invoke;
const listen = window.__TAURI__.event.listen;

const state = {
  identity: null,
  peers: [],
  selectedPeerId: null,
  incoming: new Map(),
  transfers: new Map(),
};

const el = (id) => document.getElementById(id);
const peerList = el('peerList');
const incomingList = el('incomingList');
const activityList = el('activityList');
const dropZone = el('dropZone');

function formatBytes(value) {
  let bytes = Number(value) || 0;
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let unit = 'B';
  for (const next of units) {
    bytes /= 1024;
    unit = next;
    if (bytes < 1024) break;
  }
  return bytes.toFixed(bytes >= 100 ? 0 : bytes >= 10 ? 1 : 2) + ' ' + unit;
}

function formatSpeed(value) {
  const speed = Number(value) || 0;
  return speed > 0 ? formatBytes(speed) + '/s' : '—';
}

function phaseLabel(status) {
  return {
    offering: '正在发送请求',
    waiting: '等待对方选择保存位置',
    sending: '正在发送',
    pending: '等待接收',
    accepted: '已接受',
    receiving: '正在接收',
    completed: '已完成',
    rejected: '已拒绝',
    expired: '已过期',
    error: '失败',
  }[status] || status || '';
}

let toastTimer = null;
function toast(message) {
  const node = el('toast');
  node.textContent = String(message || '');
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 3200);
}

function selectedPeer() {
  return state.peers.find((peer) => peer.id === state.selectedPeerId) || null;
}

function renderIdentity() {
  if (!state.identity) return;
  el('deviceNameButton').textContent = state.identity.deviceName;
  el('statusText').textContent = '局域网服务已开启 · 等待附近电脑';
}

function renderPeers() {
  el('peerCount').textContent = state.peers.length + ' 台';
  el('emptyPeers').classList.toggle('hidden', state.peers.length > 0);
  peerList.innerHTML = '';

  if (state.selectedPeerId && !state.peers.some((peer) => peer.id === state.selectedPeerId)) {
    state.selectedPeerId = null;
  }
  if (!state.selectedPeerId && state.peers.length === 1) {
    state.selectedPeerId = state.peers[0].id;
  }

  for (const peer of state.peers) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'peer-card' + (peer.id === state.selectedPeerId ? ' selected' : '');

    const name = document.createElement('div');
    name.className = 'peer-name';
    const dot = document.createElement('span');
    dot.className = 'peer-dot';
    const label = document.createElement('span');
    label.textContent = peer.name;
    name.append(dot, label);

    const meta = document.createElement('div');
    meta.className = 'peer-meta';
    meta.textContent = peer.address + ' · ' + (peer.platform === 'macos' ? 'Mac' : peer.platform === 'windows' ? 'Windows' : peer.platform);

    card.append(name, meta);
    card.addEventListener('click', () => {
      state.selectedPeerId = peer.id;
      renderPeers();
    });
    peerList.appendChild(card);
  }
  renderTarget();
}

function renderTarget() {
  const peer = selectedPeer();
  const enabled = Boolean(peer);
  dropZone.classList.toggle('disabled', !enabled);
  el('chooseFiles').disabled = !enabled;
  el('chooseFolder').disabled = !enabled;

  if (!peer) {
    el('targetName').textContent = '请先选择左侧电脑';
    el('targetAddress').textContent = '选中电脑后，把文件或文件夹拖到下面';
    el('targetBadge').textContent = '未选择';
    return;
  }
  el('targetName').textContent = peer.name;
  el('targetAddress').textContent = peer.address;
  el('targetBadge').textContent = '在线';
}

function renderIncoming() {
  const pending = [...state.incoming.values()].filter((offer) => offer.status === 'pending');
  el('incomingSection').classList.toggle('hidden', pending.length === 0);
  incomingList.innerHTML = '';

  for (const offer of pending) {
    const card = document.createElement('div');
    card.className = 'incoming-card';

    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = offer.senderName + ' 发来文件';
    const meta = document.createElement('div');
    meta.className = 'incoming-meta';
    meta.textContent = offer.fileCount + ' 个文件 · ' + formatBytes(offer.totalBytes)
      + (offer.skippedSymlinks ? ' · 跳过 ' + offer.skippedSymlinks + ' 个链接' : '');
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'incoming-actions';
    const accept = document.createElement('button');
    accept.className = 'primary-button';
    accept.textContent = '选择位置并接收';
    const reject = document.createElement('button');
    reject.className = 'danger-button';
    reject.textContent = '拒绝';
    actions.append(accept, reject);
    card.append(info, actions);

    accept.addEventListener('click', async () => {
      accept.disabled = true;
      try {
        const path = await invoke('accept_incoming', { transferId: offer.id });
        if (path) toast('开始接收，保存到：' + path);
        else accept.disabled = false;
      } catch (error) {
        accept.disabled = false;
        toast(error);
      }
    });

    reject.addEventListener('click', async () => {
      try {
        await invoke('reject_incoming', { transferId: offer.id });
      } catch (error) {
        toast(error);
      }
    });
    incomingList.appendChild(card);
  }
}

function upsertTransfer(key, patch) {
  const previous = state.transfers.get(key) || {};
  state.transfers.set(key, { ...previous, ...patch, updatedAt: Date.now() });
  renderActivity();
}

function renderActivity() {
  const items = [...state.transfers.entries()]
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  el('emptyActivity').classList.toggle('hidden', items.length > 0);
  activityList.innerHTML = '';

  for (const [, item] of items) {
    const total = Number(item.totalBytes) || 0;
    const current = Number(item.transferredBytes) || 0;
    const percent = total > 0
      ? Math.min(100, Math.round(current * 100 / total))
      : item.status === 'completed' ? 100 : 0;

    const card = document.createElement('div');
    card.className = 'transfer-card'
      + (item.status === 'completed' ? ' done' : '')
      + (item.status === 'error' ? ' error' : '');

    const head = document.createElement('div');
    head.className = 'transfer-head';
    const title = document.createElement('div');
    title.className = 'transfer-title';
    title.textContent = (item.direction === 'receive' ? '接收自 ' : '发送到 ') + (item.peerName || '未知电脑');
    const status = document.createElement('div');
    status.className = 'transfer-status';
    status.textContent = phaseLabel(item.status);
    head.append(title, status);

    const progress = document.createElement('div');
    progress.className = 'progress';
    const bar = document.createElement('div');
    bar.style.width = percent + '%';
    progress.appendChild(bar);

    const meta = document.createElement('div');
    meta.className = 'transfer-meta';
    const left = document.createElement('span');
    left.textContent = formatBytes(current) + ' / ' + formatBytes(total) + ' · ' + percent + '%';
    const right = document.createElement('span');
    right.textContent = item.status === 'error' ? (item.error || '传输失败') : formatSpeed(item.bytesPerSecond);
    meta.append(left, right);

    card.append(head, progress, meta);
    activityList.appendChild(card);
  }
}

async function sendPaths(paths) {
  const peer = selectedPeer();
  if (!peer) {
    toast('请先选择要发送到哪台电脑');
    return;
  }
  const clean = [...new Set((paths || []).filter(Boolean))];
  if (!clean.length) return;

  try {
    await invoke('send_selected_paths', { peerId: peer.id, paths: clean });
    toast('已发起传输请求');
  } catch (error) {
    toast(error);
  }
}

el('chooseFiles').addEventListener('click', async () => {
  try {
    sendPaths(await invoke('choose_files'));
  } catch (error) {
    toast(error);
  }
});

el('chooseFolder').addEventListener('click', async () => {
  try {
    sendPaths(await invoke('choose_folder'));
  } catch (error) {
    toast(error);
  }
});

el('deviceNameButton').addEventListener('click', async () => {
  const current = state.identity ? state.identity.deviceName : '';
  const name = window.prompt('输入这台电脑在局域网中显示的名称：', current);
  if (name === null) return;
  try {
    const updated = await invoke('set_device_name', { name });
    state.identity = updated;
    renderIdentity();
  } catch (error) {
    toast(error);
  }
});

el('quitButton').addEventListener('click', () => invoke('quit_app'));
el('dismissNotice').addEventListener('click', () => el('firewallNotice').classList.add('hidden'));
el('clearCompleted').addEventListener('click', () => {
  for (const [key, item] of state.transfers) {
    if (['completed', 'error', 'rejected', 'expired'].includes(item.status)) {
      state.transfers.delete(key);
    }
  }
  renderActivity();
});

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (selectedPeer()) dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));

listen('files-dropped', (event) => {
  dropZone.classList.remove('dragging');
  sendPaths(event.payload || []);
});

listen('peers-updated', (event) => {
  state.peers = event.payload || [];
  renderPeers();
});

listen('identity-updated', (event) => {
  state.identity = event.payload;
  renderIdentity();
});

listen('incoming-offer', (event) => {
  const offer = event.payload;
  state.incoming.set(offer.id, offer);
  renderIncoming();
  upsertTransfer('recv-' + offer.id, {
    direction: 'receive',
    peerName: offer.senderName,
    status: offer.status,
    totalBytes: offer.totalBytes,
    transferredBytes: offer.receivedBytes || 0,
    bytesPerSecond: 0,
  });
});

listen('incoming-updated', (event) => {
  const offer = event.payload;
  state.incoming.set(offer.id, offer);
  renderIncoming();
  upsertTransfer('recv-' + offer.id, {
    direction: 'receive',
    peerName: offer.senderName,
    status: offer.status,
    totalBytes: offer.totalBytes,
    transferredBytes: offer.receivedBytes || 0,
    error: offer.error,
  });
});

listen('receive-progress', (event) => {
  const progress = event.payload;
  upsertTransfer('recv-' + progress.id, progress);
});

listen('send-progress', (event) => {
  const progress = event.payload;
  upsertTransfer('send-' + progress.id, progress);
});

listen('app-error', (event) => {
  toast(event.payload || '局域网服务出现错误');
});

(async function initialize() {
  try {
    const initial = await invoke('get_state');
    state.identity = {
      deviceId: initial.deviceId,
      deviceName: initial.deviceName,
    };
    state.peers = initial.peers || [];
    for (const offer of initial.incoming || []) {
      state.incoming.set(offer.id, offer);
    }
    el('versionText').textContent = 'v' + initial.version;
    renderIdentity();
    renderPeers();
    renderIncoming();
    renderActivity();
  } catch (error) {
    el('statusText').textContent = '启动失败：' + error;
  }
})();
