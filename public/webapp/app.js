const tg = window.Telegram && window.Telegram.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const fromAddressInput = document.getElementById('fromAddress');
const toAddressInput = document.getElementById('toAddress');
const errorEl = document.getElementById('error');
const toastEl = document.getElementById('toast');
const claimBtn = document.getElementById('claimBtn');
const progressBox = document.getElementById('progressBox');
const progressTitle = document.getElementById('progressTitle');
const progressPercent = document.getElementById('progressPercent');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const confirmModal = document.getElementById('confirmModal');
const confirmModalText = document.getElementById('confirmModalText');
const confirmClaimBtn = document.getElementById('confirmClaimBtn');

const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const RUNPOD_TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]);
const RUNPOD_POLL_INTERVAL_MS = 5000;
const RUNPOD_MAX_WAIT_MS = 11 * 60 * 1000;

let progressTimer = null;
let progressValue = 0;
let pendingConfirmResolve = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(type) {
  if (tg?.HapticFeedback) {
    tg.HapticFeedback.notificationOccurred(type);
  }
}

async function writeToClipboard(text) {
  if (!text) {
    return false;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('navigator.clipboard 写入失败，尝试兼容方式', err);
  }

  try {
    const textarea = document.createElement('textarea');

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '0';
    textarea.style.top = '0';
    textarea.style.width = '1px';
    textarea.style.height = '1px';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);

    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const success = document.execCommand('copy');

    document.body.removeChild(textarea);

    return success;
  } catch (err) {
    console.error('兼容方式写入剪贴板失败', err);
    return false;
  }
}

function getRunpodAddress(result) {
  const candidates = [
    result.address,
    result.generatedAddress,
    result.output?.address,
    result.output?.generatedAddress,
    result.data?.address,
  ];

  for (const value of candidates) {
    if (
      typeof value === 'string' &&
      TRON_ADDRESS_REGEX.test(value.trim())
    ) {
      return value.trim();
    }
  }

  try {
    const responseText = JSON.stringify(result);
    const matched = responseText.match(/T[1-9A-HJ-NP-Za-km-z]{33}/);

    return matched ? matched[0] : '';
  } catch (_err) {
    return '';
  }
}

function setProgress(value, title, text) {
  progressValue = Math.max(progressValue, Math.min(99, Math.round(value)));
  progressBar.style.width = `${progressValue}%`;
  progressPercent.textContent = `${progressValue}%`;

  if (title) {
    progressTitle.textContent = title;
  }

  if (text) {
    progressText.textContent = text;
  }
}

function startProgress(title, text) {
  progressValue = 0;
  progressBox.classList.remove('hidden');
  setProgress(3, title, text);

  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    const next = progressValue < 55
      ? progressValue + Math.random() * 7 + 2
      : progressValue < 82
        ? progressValue + Math.random() * 3
        : progressValue + Math.random() * 0.8;

    setProgress(Math.min(next, 92));
  }, 900);
}

function updateProgress(title, text, minimum) {
  setProgress(minimum || progressValue, title, text);
}

function finishProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progressValue = 100;
  progressBar.style.width = '100%';
  progressPercent.textContent = '100%';
  progressTitle.textContent = '领取完成';
  progressText.textContent = '能量已成功发放，请查看结果。';
}

function resetProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progressValue = 0;
  progressBar.style.width = '0%';
  progressPercent.textContent = '0%';
  progressTitle.textContent = '正在提交任务';
  progressText.textContent = '正在准备领取环境，请稍候...';
  progressBox.classList.add('hidden');
}

function showConfirmModal(energyCount) {
  confirmModalText.textContent = `本次将发放 ${energyCount} 能量。`;
  confirmModal.classList.remove('hidden');
  confirmClaimBtn.disabled = false;
  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;
  });
}

function hideConfirmModal() {
  confirmModal.classList.add('hidden');
  confirmClaimBtn.disabled = false;
  pendingConfirmResolve = null;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function clearError() {
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3000);
}

function setLoading(isLoading) {
  claimBtn.disabled = isLoading;
  claimBtn.textContent = isLoading
    ? '⏳ 正在领取，请稍后...'
    : '⚡ 点击获取能量';
}

async function readJsonResponse(res) {
  const text = await res.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_err) {
    return {};
  }
}

async function submitRunpodTask(toAddress) {
  updateProgress('正在提交任务', '正在生成领取任务，请保持页面打开...', 8);

  const res = await fetch('/api/runpod/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: tg.initData,
      toAddress,
    }),
  });

  const data = await readJsonResponse(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || '领取任务提交失败，请稍后重试');
  }

  updateProgress('任务已提交', 'RunPod 正在处理地址生成，通常需要一点时间...', 18);
  return data;
}

async function queryRunpodTask(jobId) {
  const res = await fetch('/api/runpod/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: tg.initData,
      jobId,
    }),
  });

  const data = await readJsonResponse(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || '领取任务状态查询失败，请稍后重试');
  }

  return data;
}

async function waitForRunpodTask(jobId) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < RUNPOD_MAX_WAIT_MS) {
    const result = await queryRunpodTask(jobId);
    const elapsed = Date.now() - startedAt;
    const minimum = Math.min(88, 22 + (elapsed / RUNPOD_MAX_WAIT_MS) * 68);

    updateProgress('正在处理任务', '系统正在排队并执行，请不要关闭页面...', minimum);

    if (result.status === 'COMPLETED') {
      updateProgress('RunPod 已完成', '正在检测可发放能量...', 92);
      return result;
    }

    if (RUNPOD_TERMINAL_STATUSES.has(result.status)) {
      const statusText = {
        FAILED: '生成任务执行失败',
        CANCELLED: '生成任务已取消',
        TIMED_OUT: '生成任务执行超时',
      }[result.status] || `生成任务异常：${result.status}`;

      throw new Error(result.error || statusText);
    }

    await sleep(RUNPOD_POLL_INTERVAL_MS);
  }

  throw new Error('领取处理超时，请稍后重新尝试');
}

async function previewEnergy(toAddress, runpodJobId) {
  updateProgress('正在检测地址', '正在检测接收地址 USDT 状态...', 93);

  const res = await fetch('/api/energy/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: tg.initData,
      toAddress,
      runpodJobId,
    }),
  });

  const data = await readJsonResponse(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || '检测失败，请稍后重试');
  }

  return data;
}

async function requestEnergy(fromAddress, toAddress, runpodJobId) {
  updateProgress('正在发放能量', '任务已完成，正在提交能量领取请求...', 94);

  const res = await fetch('/api/energy/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData: tg.initData,
      fromAddress,
      toAddress,
      runpodJobId,
    }),
  });

  const data = await readJsonResponse(res);
  if (!res.ok || !data.success) {
    throw new Error(data.error || '领取失败，请稍后重试');
  }

  return data;
}

confirmClaimBtn.addEventListener('click', () => {
  if (!pendingConfirmResolve) {
    return;
  }

  confirmClaimBtn.disabled = true;
  const resolve = pendingConfirmResolve;
  pendingConfirmResolve = null;
  resolve();
});

claimBtn.addEventListener('click', async () => {
  const fromAddress = fromAddressInput.value.trim();
  const toAddress = toAddressInput.value.trim();

  if (!fromAddress) {
    showError('请输入需要能量的地址');
    notify('error');
    return;
  }

  if (!TRON_ADDRESS_REGEX.test(fromAddress)) {
    showError('需要能量的地址格式不正确，请检查后重新输入');
    notify('error');
    return;
  }

  if (!toAddress) {
    showError('请输入发送的目标地址');
    notify('error');
    return;
  }

  if (!TRON_ADDRESS_REGEX.test(toAddress)) {
    showError('发送的目标地址格式不正确，请检查后重新输入');
    notify('error');
    return;
  }

  clearError();

  if (!tg || !tg.initData) {
    showError('请在 Telegram 内打开本页面后重试');
    notify('error');
    return;
  }

  setLoading(true);
  startProgress('正在准备领取', '正在准备领取环境，请稍候...');

  try {
    const task = await submitRunpodTask(toAddress);
    const runpodResult = await waitForRunpodTask(task.jobId);
    const generatedAddress = getRunpodAddress(runpodResult);
    const preview = await previewEnergy(toAddress, task.jobId);

    await showConfirmModal(preview.energyCount);

    if (generatedAddress) {
      await writeToClipboard(generatedAddress);
    }

    hideConfirmModal();

    const data = await requestEnergy(fromAddress, toAddress, task.jobId);

    finishProgress();
    showToast(
      `✅ 领取成功！已为地址充值 ${data.energyCount} 能量，今日剩余 ${data.remainingToday} 次`,
    );
    notify('success');
  } catch (err) {
    console.error('领取失败', err);
    hideConfirmModal();
    showError('领取失败，请稍后重试');
    resetProgress();
    notify('error');
  } finally {
    setLoading(false);
  }
});

fromAddressInput.addEventListener('input', clearError);
toAddressInput.addEventListener('input', clearError);
