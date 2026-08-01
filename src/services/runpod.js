const fetch = require('node-fetch');

const REQUEST_TIMEOUT_MS = 20000;
const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]);

function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function buildHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function buildBaseUrl(endpointId) {
  return `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}`;
}

async function parseResponse(res) {
  const text = await res.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_err) {
    return { raw: text };
  }
}

async function submitRunpodJob({
  suffix,
  apiKey,
  endpointId,
  timeoutSeconds,
}) {
  if (!apiKey || !endpointId) {
    throw new Error('RunPod 环境变量未配置完整');
  }

  const res = await fetchWithTimeout(`${buildBaseUrl(endpointId)}/run`, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({
      input: {
        suffix,
        prefix: '',
        matches_wanted: 1,
        timeout: timeoutSeconds,
      },
    }),
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const message = data.error || data.message || data.raw || `RunPod 提交失败，状态码 ${res.status}`;
    throw new Error(message);
  }

  if (!data.id) {
    throw new Error('RunPod 未返回任务 ID');
  }

  return data;
}

async function getRunpodJobStatus({ jobId, apiKey, endpointId }) {
  if (!apiKey || !endpointId) {
    throw new Error('RunPod 环境变量未配置完整');
  }

  const res = await fetchWithTimeout(
    `${buildBaseUrl(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      method: 'GET',
      headers: buildHeaders(apiKey),
    },
  );

  const data = await parseResponse(res);

  if (!res.ok) {
    const message = data.error || data.message || data.raw || `RunPod 查询失败，状态码 ${res.status}`;
    throw new Error(message);
  }

  return data;
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

module.exports = {
  submitRunpodJob,
  getRunpodJobStatus,
  isTerminalStatus,
};
