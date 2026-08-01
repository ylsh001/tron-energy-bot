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
  claimBtn.textContent = isLoading ? '⏳ 正在申请能量...' : '⚡ 点击获取能量';
}

claimBtn.addEventListener('click', async () => {
  const fromAddress = fromAddressInput.value.trim();
  const toAddress = toAddressInput.value.trim();

  if (!fromAddress) {
    showError('请输入需要能量的地址');
    if (tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('error');
    return;
  }
  if (!TRON_ADDRESS_REGEX.test(fromAddress)) {
    showError('需要能量的地址格式不正确，请检查后重新输入');
    if (tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('error');
    return;
  }
  if (!toAddress) {
    showError('请输入发送的目标地址');
    if (tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('error');
    return;
  }
  if (!TRON_ADDRESS_REGEX.test(toAddress)) {
    showError('发送的目标地址格式不正确，请检查后重新输入');
    if (tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('error');
    return;
  }

  clearError();

  if (!tg || !tg.initData) {
    showError('请在 Telegram 内打开本页面后重试');
    return;
  }

  setLoading(true);
  try {
    const res = await fetch('/api/energy/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initData: tg.initData,
        fromAddress,
        toAddress,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.error || '领取失败，请稍后重试');
      if (tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('error');
      return;
    }

    showToast(`✅ 领取成功！已为地址充值 ${data.energyCount} 能量，今日剩余 ${data.remainingToday} 次`);
    if (tg) tg.HapticFeedback && tg.HapticFeedback.notificationOccurred('success');
  } catch (err) {
    showError('网络异常，请稍后重试');
  } finally {
    setLoading(false);
  }
});

fromAddressInput.addEventListener('input', clearError);
toAddressInput.addEventListener('input', clearError);
