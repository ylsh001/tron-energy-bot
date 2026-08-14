const config = require('../config');
const { query, withClient } = require('./db');
const { getUsdtBalance } = require('./tronGrid');
const {
  listRunpodResultAddresses,
  updateRunpodAddressUsdtBalance,
} = require('./runpodJobStore');

const SETTING_KEY = 'usdt_balance_monitor';
const INTERVAL_MS = 60_000;
const CONCURRENCY = 4;
const ADVISORY_LOCK_ID = 742018531;

let timer = null;
let runningPromise = null;
let enabled = true;
let lastStartedAt = null;
let lastFinishedAt = null;
let lastSuccessAt = null;
let lastError = null;
let lastResult = { checked: 0, updated: 0, failed: 0 };

async function readEnabled() {
  const result = await query('SELECT value FROM app_settings WHERE key = $1', [SETTING_KEY]);
  enabled = result.rows[0]?.value?.enabled !== false;
  return enabled;
}

async function setEnabled(nextEnabled) {
  enabled = Boolean(nextEnabled);
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [SETTING_KEY, { enabled }],
  );
  return getStatus();
}

async function refreshAddress(address, checkedAt) {
  const balance = await getUsdtBalance(address, {
    tronGridBaseUrl: config.tronGridBaseUrl,
    tronGridApiKey: config.tronGridApiKey,
  });
  await updateRunpodAddressUsdtBalance(address, balance, checkedAt);
}

async function runRefresh() {
  return withClient(async (client) => {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_ID]);
    if (!lockResult.rows[0]?.locked) {
      return getStatus();
    }

    try {
      lastStartedAt = new Date();
      lastError = null;
      const addresses = await listRunpodResultAddresses();
      let cursor = 0;
      let updated = 0;
      let failed = 0;
      const errors = [];

      async function worker() {
        while (cursor < addresses.length) {
          const address = addresses[cursor];
          cursor += 1;
          try {
            await refreshAddress(address, new Date());
            updated += 1;
          } catch (err) {
            failed += 1;
            errors.push(`${address}: ${err.message}`);
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, addresses.length) }, () => worker()));
      lastFinishedAt = new Date();
      lastResult = { checked: addresses.length, updated, failed };

      if (failed > 0) {
        lastError = `${failed} 个地址查询失败：${errors.slice(0, 3).join('；')}`;
      } else {
        lastSuccessAt = lastFinishedAt;
      }

      return getStatus();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    }
  });
}

function refreshNow() {
  if (!runningPromise) {
    runningPromise = runRefresh()
      .catch((err) => {
        lastFinishedAt = new Date();
        lastError = err.message;
        throw err;
      })
      .finally(() => {
        runningPromise = null;
      });
  }
  return runningPromise;
}

function getStatus() {
  return {
    enabled,
    running: Boolean(runningPromise),
    intervalMs: INTERVAL_MS,
    lastStartedAt,
    lastFinishedAt,
    lastSuccessAt,
    lastError,
    lastResult,
  };
}

async function startUsdtBalanceMonitor() {
  await readEnabled();
  timer = setInterval(async () => {
    try {
      await readEnabled();
      if (enabled) {
        await refreshNow();
      }
    } catch (err) {
      console.error('USDT 余额监控查询失败', err);
    }
  }, INTERVAL_MS);
  timer.unref?.();

  if (enabled) {
    refreshNow().catch((err) => console.error('USDT 余额监控首次查询失败', err));
  }
}

function stopUsdtBalanceMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  getStatus,
  setEnabled,
  refreshNow,
  startUsdtBalanceMonitor,
  stopUsdtBalanceMonitor,
};
