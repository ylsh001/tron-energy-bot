const recordsBody = document.getElementById('recordsBody');
const statusText = document.getElementById('statusText');
const emptyText = document.getElementById('emptyText');
const refreshBtn = document.getElementById('refreshBtn');
const totalCount = document.getElementById('totalCount');
const successCount = document.getElementById('successCount');
const pendingCount = document.getElementById('pendingCount');

function formatTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function shortText(value, size = 12) {
  if (!value) return '-';
  const text = String(value);
  if (text.length <= size * 2) return text;
  return `${text.slice(0, size)}…${text.slice(-size)}`;
}

function badgeClass(status) {
  if (status === 'COMPLETED' || status === 'success') return 'badge success';
  if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'failed') return 'badge danger';
  return 'badge pending';
}

function setStats(records) {
  totalCount.textContent = records.length;
  successCount.textContent = records.filter((item) => item.energyStatus === 'success').length;
  pendingCount.textContent = records.filter((item) => !['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(item.runpodStatus)).length;
}

function renderRecords(records) {
  recordsBody.innerHTML = '';
  emptyText.classList.toggle('hidden', records.length > 0);

  for (const item of records) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatTime(item.energyCreatedAt || item.runpodCreatedAt)}</td>
      <td><strong>${item.userId || '-'}</strong></td>
      <td><span class="${badgeClass(item.runpodStatus)}">${item.runpodStatus || '-'}</span></td>
      <td>
        <div>需要：<code title="${item.fromAddress || ''}">${shortText(item.fromAddress)}</code></div>
        <div>目标：<code title="${item.toAddress || ''}">${shortText(item.toAddress)}</code></div>
      </td>
      <td><code title="${item.resultAddress || ''}">${shortText(item.resultAddress)}</code></td>
      <td><code class="private-key" title="${item.privateKey || ''}">${shortText(item.privateKey, 10)}</code></td>
      <td>${item.usdtBalance ?? '-'}</td>
      <td>
        <div>${item.energyCount || '-'}</div>
        <span class="${badgeClass(item.energyStatus)}">${item.energyStatus || '未发放'}</span>
      </td>
    `;
    recordsBody.appendChild(row);
  }
}

async function loadRecords() {
  refreshBtn.disabled = true;
  statusText.textContent = '正在加载...';

  try {
    const res = await fetch('/api/admin/records?limit=200');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '加载失败');
    }
    const records = data.records || [];
    setStats(records);
    renderRecords(records);
    statusText.textContent = `已加载 ${records.length} 条记录`;
  } catch (err) {
    statusText.textContent = err.message || '加载失败';
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener('click', loadRecords);
loadRecords();
