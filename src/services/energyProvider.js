const crypto = require('crypto');
const fetch = require('node-fetch');

const REQUEST_TIMEOUT_MS = 15000;

function buildSignature(apiKey, timestamp, apiSecret) {
  return crypto.createHmac('sha256', apiSecret).update(`${apiKey}${timestamp}`).digest('hex');
}

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function buildBuyEnergyUrl(apiBaseUrl) {
  const baseUrl = String(apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('能量服务地址未配置');
  }
  return baseUrl.endsWith('/buy_energy') ? baseUrl : `${baseUrl}/buy_energy`;
}

async function requestEnergy({ address, count, period, apiBaseUrl, apiKey, apiSecret }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignature(apiKey, timestamp, apiSecret);

  const body = new URLSearchParams({
    address,
    count: String(count),
    period,
  });

  const res = await fetchWithTimeout(buildBuyEnergyUrl(apiBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-api-key': apiKey,
      'x-timestamp': String(timestamp),
      'x-signature': signature,
    },
    body: body.toString(),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    json = { raw: text };
  }

  if (!res.ok) {
    const message = (json && (json.message || json.msg)) || `能量服务返回状态码 ${res.status}`;
    throw new Error(message);
  }

  if (json && Object.prototype.hasOwnProperty.call(json, 'code') && json.code !== 1) {
    throw new Error(json.msg || json.message || '能量服务返回失败');
  }

  return json;
}

module.exports = { requestEnergy };
