'use strict';

const state = {
  identity: null,
  peers: [],
  selectedPeerId: null,
  incoming: new Map(),
  transfers: new Map(),
};

const el = (id) => document.getElementById(id);
const peerList = el('peerList');
const emptyPeers = el('emptyPeers');
const incomingArea = el('incomingArea');
const incomingList = el('incomingList');
const activityList = el('activityList');
const emptyActivity = el('emptyActivity');
const dropZone = el('dropZone');

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return value + ' B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 'B';
  for (const next of units) {
    size /= 1024;
    unit = next;
    if (size < 1024) break;
  }
  return size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2) + ' ' + unit;
}

function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond) return '—';
  return formatBytes(bytesPerSecond) + '/s';
}

function phaseLabel(phase) {
  return {
    preparing: '正在扫描文件',
    offering: '正在发送请求',
    waiting: '等待对方选择保存位置',
    sending: '正在发送',
    completed: '已完成',
    error: '失败',
    pending: '等待接收',
    accepted: '已接受',
    receiving: '正在接收',
    rejected: '已拒绝',
    expired: '已过期',
  }[phase] || phase;
}

let toastTimer = null;
function toast(message) {
  const node = el('toast');
  node.textContent = message;
  node.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.add('hidden'), 3200);
}

function selectedPeer() {
  return state.peers.find((peer) => peer.id === state.selectedPeerId) || null;
}

function renderIdentity() {
  if (!state.identity) return;
  el('deviceNameButton').textContent = state.identity.name;
  el('statusText').textContent = '局域网服务已开启 · 等待附近电脑';
}

function renderPeers() {
  el('peerCount').textContent = state.peers.length + ' 台';
  emptyPeers.classList.toggle('hidden', state.peers.length > 0);
  peerList.innerHTML = '';

  if (state.selectedPeerId && !state.peers.some((peer) => peer.id === state.selectedPeerId)) {
    state.selectedPeerId = null;
  }
  if (!state.selectedPeerId && state.peers.length === 1) {
    state.selectedPeerId = state.peers[0].id;
  }

  for (const peer of state.peers) {
    const card = document.createElement('button');
    card.className = 'peer-card' + (peer.id === state.selectedPeerId ? ' selected' : '');
    card.type = 'button';
    const name = document.createElement('div');
    name.className = 'peer-name';
    name.innerHTML = '<span class="computer-dot"></span>';
    const nameText = document.createElement('span');
    nameText.textContent = peer.name;
    name.appendChild(nameText);
    const address = document.createElement('div');
    address.className = 'peer-address';
    address.textContent = peer.address + ' · ' + (peer.platform === 'darwin' ? 'Mac' : 'Windows');
    card.append(name, address);
    card.addEventListener('click', () => {
      state.selectedPeerId = peer.id;
      renderPeers();
      renderTarget();
    });
    peerList.appendChild(card);
  }
  renderTarget();
}

function renderTarget() {
  const peer = selectedPeer();
  const enabled = Boolean(peer);
  dropZone.classList.toggle('disabled', !enabled);
  el('selectFilesButton').disabled = !enabled;
  el('selectFolderButton').disabled = !enabled;
  if (!peer) {
    el('targetName').textContent = '请先选择左侧电脑';
    el('targetAddress').textContent = '选择后即可拖入文件或文件夹';
    el('targetBadge').textContent = '未选择';
    el('targetBadge').className = 'target-badge offline';
    return;
  }
  el('targetName').textContent = peer.name;
  el('targetAddress').textContent = peer.address;
  el('targetBadge').textContent = '在线';
  el('targetBadge').className = 'target-badge online';
}

function pendingIncoming() {
  return [...state.incoming.values()].filter((offer) => offer.status === 'pending');
}

function renderIncoming() {
  const pending = pendingIncoming();
  incomingArea.classList.toggle('hidden', pending.length === 0);
  incomingList.innerHTML = '';

  for (const offer of pending) {
    const card = document.createElement('div');
    card.className = 'incoming-card';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = offer.sender.name + ' 发来文件';
    const meta = document.createElement('div');
    meta.className = 'incoming-meta';
    meta.textContent = offer.fileCount + ' 个文件 · ' + formatBytes(offer.totalBytes) +
      (offer.skippedSymlinks ? ' · 已跳过 ' + offer.skippedSymlinks + ' 个链接' : '');
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'incoming-actions';
    const accept = document.createElement('button');
    accept.className = 'button primary small';
    accept.textContent = '选择位置并接收';
    const reject = document.createElement('button');
    reject.className = 'button danger small';
    reject.textContent = '拒绝';
    actions.append(accept, reject);
    card.append(info, actions);

    const doAccept = async () => {
      accept.disabled = true;
      try {
        const result = await window.huiyun.acceptIncoming(offer.id);
        if (result.canceled) {
          accept.disabled = false;
          return;
        }
        toast('已选择保存位置，开始接收');
      } catch (error) {
        accept.disabled = false;
        toast(error.message || '无法接收');
      }
    };
    card.addEventListener('click', (event) => {
      if (!event.target.closest('button')) doAccept();
    });
    accept.addEventListener('click', (event) => {
      event.stopPropagation();
      doAccept();
    });
    reject.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        await window.huiyun.rejectIncoming(offer.id);
      } catch (error) {
        toast(error.message || '无法拒绝');
      }
    });
    incomingList.appendChild(card);
  }
}

function upsertTransfer(key, data) {
  const previous = state.transfers.get(key) || {};
  state.transfers.set(key, { ...previous, ...data, updatedAt: Date.now() });
  renderActivity();
}

function renderActivity() {
  const items = [...state.transfers.entries()]
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
  emptyActivity.classList.toggle('hidden', items.length > 0);
  activityList.innerHTML = '';

  for (const [key, transfer] of items) {
    const total = Number(transfer.totalBytes) || 0;
    const current = transfer.direction === 'receive'
      ? Number(transfer.receivedBytes) || 0
      : Number(transfer.sentBytes) || 0;
    const percent = total === 0
      ? (transfer.phase === 'completed' ? 100 : 0)
      : Math.min(100, Math.round((current / total) * 100));

    const card = document.createElement('div');
    card.className = 'transfer-card' +
      (transfer.phase === 'completed' ? ' done' : '') +
      (transfer.phase === 'error' ? ' error' : '');

    const head = document.createElement('div');
    head.className = 'transfer-head';
    const title = document.createElement('div');
    title.className = 'transfer-title';
    title.textContent = (transfer.direction === 'receive' ? '接收自 ' : '发送到 ') +
      (transfer.peerName || '未知电脑');
    const status = document.createElement('div');
    status.className = 'transfer-status';
    status.textContent = phaseLabel(transfer.phase);
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
    right.textContent = transfer.phase === 'error'
      ? (transfer.error || '传输失败')
      : formatSpeed(transfer.bytesPerSecond);
    meta.append(left, right);

    card.append(head, progress, meta);
    activityList.appendChild(card);
  }
}

async function sendPaths(paths) {
  const peer = selectedPeer();
  if (!peer) return toast('请先选择要发送到哪台电脑');
  const clean = [...new Set(paths.filter(Boolean))];
  if (!clean.length) return;
  upsertTransfer('prepare-' + Date.now(), {
    direction: 'send',
    phase: 'preparing',
    peerName: peer.name,
    totalBytes: 0,
    sentBytes: 0,
    bytesPerSecond: 0,
  });
  try {
    await window.huiyun.sendPaths(peer.id, clean);
    toast('正在扫描并发送请求');
  } catch (error) {
    toast(error.message || '发送失败');
  }
}

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (selectedPeer()) dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  if (!selectedPeer()) return toast('请先选择左侧电脑');
  const paths = Array.from(event.dataTransfer.files || [])
    .map((file) => window.huiyun.getPathForFile(file))
    .filter(Boolean);
  sendPaths(paths);
});

el('selectFilesButton').addEventListener('click', async () => sendPaths(await window.huiyun.selectFiles()));
el('selectFolderButton').addEventListener('click', async () => sendPaths(await window.huiyun.selectFolder()));

el('deviceNameButton').addEventListener('click', async () => {
  const current = state.identity ? state.identity.name : '';
  const name = window.prompt('输入这台电脑在局域网里显示的名称：', current);
  if (name === null) return;
  try {
    state.identity = await window.huiyun.setDeviceName(name);
    renderIdentity();
  } catch (error) {
    toast(error.message || '名称修改失败');
  }
});

el('dismissFirewall').addEventListener('click', () => el('firewallTip').classList.add('hidden'));
el('clearCompleted').addEventListener('click', () => {
  for (const [key, item] of state.transfers) {
    if (item.phase === 'completed' || item.phase === 'error') state.transfers.delete(key);
  }
  renderActivity();
});

window.huiyun.onPeersUpdated((peers) => {
  state.peers = peers || [];
  renderPeers();
});
window.huiyun.onIdentityUpdated((identity) => {
  state.identity = identity;
  renderIdentity();
});
window.huiyun.onIncomingOffer((offer) => {
  state.incoming.set(offer.id, offer);
  renderIncoming();
  upsertTransfer('recv-' + offer.id, {
    direction: 'receive',
    phase: offer.status,
    peerName: offer.sender.name,
    totalBytes: offer.totalBytes,
    receivedBytes: offer.receivedBytes || 0,
    bytesPerSecond: 0,
  });
});
window.huiyun.onIncomingUpdated((offer) => {
  state.incoming.set(offer.id, offer);
  renderIncoming();
  upsertTransfer('recv-' + offer.id, {
    direction: 'receive',
    phase: offer.status,
    peerName: offer.sender.name,
    totalBytes: offer.totalBytes,
    receivedBytes: offer.receivedBytes || 0,
    error: offer.error,
  });
});
window.huiyun.onIncomingProgress((offer) => {
  const existing = state.transfers.get('recv-' + offer.id) || {};
  const now = Date.now();
  const previousAt = existing.progressAt || now;
  const previousBytes = existing.receivedBytes || 0;
  const seconds = Math.max((now - previousAt) / 1000, .001);
  const speed = Math.max(0, (offer.receivedBytes - previousBytes) / seconds);
  upsertTransfer('recv-' + offer.id, {
    direction: 'receive',
    phase: offer.status,
    peerName: offer.sender.name,
    totalBytes: offer.totalBytes,
    receivedBytes: offer.receivedBytes || 0,
    bytesPerSecond: speed,
    progressAt: now,
  });
});
window.huiyun.onSendEvent((event) => {
  for (const [key, item] of state.transfers) {
    if (key.startsWith('prepare-') && item.peerName === event.peer.name) {
      state.transfers.delete(key);
      break;
    }
  }
  upsertTransfer('send-' + event.id, {
    direction: 'send',
    phase: event.phase,
    peerName: event.peer && event.peer.name,
    totalBytes: event.totalBytes,
    sentBytes: event.sentBytes,
    bytesPerSecond: event.bytesPerSecond,
    error: event.error,
  });
});
window.huiyun.onAppError((error) => toast(error.message || '局域网服务出现错误'));

(async function init() {
  try {
    const initial = await window.huiyun.getState();
    state.identity = initial.identity;
    state.peers = initial.peers || [];
    for (const offer of initial.incoming || []) state.incoming.set(offer.id, offer);
    el('versionText').textContent = 'v' + initial.version;
    renderIdentity();
    renderPeers();
    renderIncoming();
    renderActivity();
  } catch (error) {
    el('statusText').textContent = '启动失败：' + (error.message || error);
  }
})();
