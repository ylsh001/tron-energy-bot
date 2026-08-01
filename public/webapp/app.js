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

const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const RUNPOD_TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]);
const RUNPOD_POLL_INTERVAL_MS = 5000;
const RUNPOD_MAX_WAIT_MS = 11 * 60 * 1000;

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
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);
    textarea.focus();
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
    if (typeof value === 'string' && TRON_ADDRESS_REGEX.test(value.trim())) {
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

    if (result.status === 'COMPLETED') {
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

async function requestEnergy(fromAddress, toAddress, runpodJobId) {
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

  try {
    const task = await submitRunpodTask(toAddress);
    const runpodResult = await waitForRunpodTask(task.jobId);
    const generatedAddress = getRunpodAddress(runpodResult);

    if (!generatedAddress) {
      throw new Error('RunPod 已执行完成，但没有返回有效的 TRON 地址');
    }

    await writeToClipboard(generatedAddress);
    const data = await requestEnergy(fromAddress, toAddress, task.jobId);

    showToast(
      `✅ 领取成功！已为地址充值 ${data.energyCount} 能量，今日剩余 ${data.remainingToday} 次`,
    );
    notify('success');
  } catch (err) {
    console.error('领取失败', err);
    showError(err.message || '领取失败，请稍后重试');
    notify('error');
  } finally {
    setLoading(false);
  }
});

fromAddressInput.addEventListener('input', clearError);
toAddressInput.addEventListener('input', clearError);
