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

async function requestEnergy({ address, count, resourceType, apiBaseUrl, apiKey, apiSecret }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildSignature(apiKey, timestamp, apiSecret);

  const body = new URLSearchParams({
    address,
    count: String(count),
    resource_type: resourceType,
  });

  const res = await fetchWithTimeout(apiBaseUrl, {
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

  return json;
}

module.exports = { requestEnergy };
