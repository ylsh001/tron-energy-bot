const fetch = require('node-fetch');

const TRC20_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRONGRID_TIMEOUT_MS = 8000;
const USDT_DECIMALS = 6;

function fetchWithTimeout(url, options = {}, timeoutMs = TRONGRID_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function getAccount(address, { tronGridBaseUrl, tronGridApiKey }) {
  const url = `${tronGridBaseUrl}/v1/accounts/${address}`;
  const headers = {};
  if (tronGridApiKey) {
    headers['TRON-PRO-API-KEY'] = tronGridApiKey;
  }

  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) {
    throw new Error(`TronGrid 查询失败，状态码 ${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : null;
}

async function getUsdtBalance(address, options) {
  const account = await getAccount(address, options);
  if (!account) {
    return 0;
  }

  const trc20List = Array.isArray(account.trc20) ? account.trc20 : [];
  const rawBalance = trc20List.reduce((total, entry) => {
    const balance = entry[TRC20_USDT_CONTRACT];
    return total + (balance ? Number(balance) : 0);
  }, 0);

  if (!Number.isFinite(rawBalance) || rawBalance <= 0) {
    return 0;
  }

  return rawBalance / 10 ** USDT_DECIMALS;
}

async function getEnergyBalance(address, options) {
  const account = await getAccount(address, options);
  if (!account) {
    return 0;
  }

  const energyLimit = Number(account.account_resource?.energy_limit || 0);
  const energyUsed = Number(account.account_resource?.energy_usage || 0);
  return Math.max(0, energyLimit - energyUsed);
}

async function hasUsdtBalance(address, options) {
  return (await getUsdtBalance(address, options)) > 0;
}

module.exports = { hasUsdtBalance, getUsdtBalance, getEnergyBalance, TRC20_USDT_CONTRACT };
