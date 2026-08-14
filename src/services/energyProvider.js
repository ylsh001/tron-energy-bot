const crypto = require('crypto');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

const REQUEST_TIMEOUT_MS = 15000;

function buildSignature(apiKey, timestamp, apiSecret) {
  return crypto.createHmac('sha256', apiSecret).update(`${apiKey}${timestamp}`).digest('hex');
}

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normalizeProxyUrl(proxyUrl) {
  const value = String(proxyUrl || '').trim();
  if (!value) {
    return '';
  }

  const match = value.match(/^(https?):\/\/([^:]+):(\d+):([^:]+):(.+)$/);
  if (!match) {
    return value;
  }

  const [, protocol, host, port, username, password] = match;
  return `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function buildFetchOptions({ method, headers, body, proxyUrl }) {
  const options = { method, headers, body };
  const normalizedProxyUrl = normalizeProxyUrl(proxyUrl);
  if (normalizedProxyUrl) {
    options.agent = new HttpsProxyAgent(normalizedProxyUrl);
  }
  return options;
}

function buildBuyEnergyUrl(apiBaseUrl) {
  const baseUrl = String(apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('能量服务地址未配置');
  }
  return baseUrl.endsWith('/buy_energy') ? baseUrl : `${baseUrl}/buy_energy`;
}

function assertProviderConfig({ apiKey, apiSecret, period }) {
  if (!apiKey) {
    throw new Error('能量服务 API Key 未配置');
  }
  if (!apiSecret) {
    throw new Error('能量服务 API Secret 未配置');
  }
  if (!period) {
    throw new Error('能量服务周期未配置');
  }
}

async function requestEnergy({ address, count, period, apiBaseUrl, apiKey, apiSecret, proxyUrl }) {
  assertProviderConfig({ apiKey, apiSecret, period });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignature(apiKey, timestamp, apiSecret);

  const body = new URLSearchParams({
    address,
    count: String(count),
    period,
  });

  const res = await fetchWithTimeout(buildBuyEnergyUrl(apiBaseUrl), buildFetchOptions({
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-api-key': apiKey,
      'x-timestamp': String(timestamp),
      'x-signature': signature,
    },
    body: body.toString(),
    proxyUrl,
  }));

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    json = { raw: text };
  }

  if (!res.ok) {
    const message = (json && (json.message || json.msg || json.raw)) || `能量服务返回状态码 ${res.status}`;
    throw new Error(`能量服务请求失败(${res.status})：${message}`);
  }

  if (json && Object.prototype.hasOwnProperty.call(json, 'code') && json.code !== 1) {
    throw new Error(json.msg || json.message || '能量服务返回失败');
  }

  return json;
}

module.exports = { requestEnergy };
