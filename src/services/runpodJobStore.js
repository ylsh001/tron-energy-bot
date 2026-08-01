const { query } = require('./db');
const { encryptText, decryptText } = require('./cryptoBox');
const { isTerminalStatus } = require('./runpod');

function findValueDeep(value, names) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueDeep(item, names);
      if (found) return found;
    }
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (names.includes(key) && entry !== null && entry !== undefined && String(entry)) {
      return String(entry);
    }
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

async function createRunpodJob({ id, userId, suffix, toAddress, status, rawResponse }) {
  await query(
    `INSERT INTO runpod_jobs (id, user_id, suffix, to_address, status, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       suffix = EXCLUDED.suffix,
       to_address = EXCLUDED.to_address,
       status = EXCLUDED.status,
       raw_response = EXCLUDED.raw_response,
       updated_at = NOW()`,
    [id, userId, suffix, toAddress, status, rawResponse || null],
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
  const encryptedPrivateKey = encryptText(result.privateKey);
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
    [
      jobId,
      status,
      error,
      result.address,
      encryptedPrivateKey?.encrypted || null,
      encryptedPrivateKey?.nonce || null,
      encryptedPrivateKey?.tag || null,
      data,
      finishedAt,
    ],
  );

  await query(
    `INSERT INTO runpod_status_events (job_id, status, error, raw_response)
     VALUES ($1, $2, $3, $4)`,
    [jobId, status, error, data],
  );
}

async function updateRunpodJobUsdtBalance(jobId, usdtBalance) {
  if (!jobId) return;
  await query(
    'UPDATE runpod_jobs SET usdt_balance = $2, updated_at = NOW() WHERE id = $1',
    [jobId, usdtBalance],
  );
}

async function listAdminRecords({ limit = 100, offset = 0 } = {}) {
  const result = await query(
    `SELECT
       j.id,
       j.user_id,
       j.suffix,
       j.to_address,
       j.status AS runpod_status,
       j.error AS runpod_error,
       j.result_address,
       j.private_key_encrypted,
       j.private_key_nonce,
       j.private_key_tag,
       j.usdt_balance AS runpod_usdt_balance,
       j.created_at AS runpod_created_at,
       j.updated_at AS runpod_updated_at,
       j.finished_at AS runpod_finished_at,
       e.from_address,
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
     ORDER BY j.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    suffix: row.suffix,
    toAddress: row.to_address,
    fromAddress: row.from_address,
    runpodStatus: row.runpod_status,
    runpodError: row.runpod_error,
    resultAddress: row.result_address,
    privateKey: decryptText({
      encrypted: row.private_key_encrypted,
      nonce: row.private_key_nonce,
      tag: row.private_key_tag,
    }),
    usdtBalance: row.request_usdt_balance || row.runpod_usdt_balance,
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
  listAdminRecords,
};
