const fetch = require('node-fetch');

const TRC20_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRONGRID_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}, timeoutMs = TRONGRID_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function hasUsdtBalance(address, { tronGridBaseUrl, tronGridApiKey }) {
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
  const account = Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : null;
  if (!account) {
    return false;
  }

  const trc20List = Array.isArray(account.trc20) ? account.trc20 : [];
  return trc20List.some((entry) => {
    const balance = entry[TRC20_USDT_CONTRACT];
    return balance && Number(balance) > 0;
  });
}

module.exports = { hasUsdtBalance, TRC20_USDT_CONTRACT };
