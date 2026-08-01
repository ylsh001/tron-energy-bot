const { Pool } = require('pg');
const config = require('../config');

const pool = config.databaseUrl
  ? new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    })
  : null;

function getPool() {
  if (!pool) {
    throw new Error('DATABASE_URL 未配置');
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function initDatabase() {
  if (!pool) {
    throw new Error('DATABASE_URL 未配置，PostgreSQL 持久化功能不可用');
  }

  if (!config.dataEncryptionSecret) {
    throw new Error('DATA_ENCRYPTION_SECRET 未配置，私钥无法安全入库');
  }

  await query(`
    CREATE TABLE IF NOT EXISTS energy_claims (
      user_id TEXT NOT NULL,
      claim_date DATE NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, claim_date)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS runpod_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      suffix TEXT NOT NULL,
      to_address TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      result_address TEXT,
      private_key_encrypted TEXT,
      private_key_nonce TEXT,
      private_key_tag TEXT,
      usdt_balance NUMERIC(38, 6),
      raw_response JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_runpod_jobs_user_status_created
    ON runpod_jobs (user_id, status, created_at DESC)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS runpod_status_events (
      id BIGSERIAL PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES runpod_jobs(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      error TEXT,
      raw_response JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_runpod_status_events_job_created
    ON runpod_status_events (job_id, created_at DESC)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS energy_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      first_name TEXT,
      username TEXT,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      runpod_job_id TEXT REFERENCES runpod_jobs(id) ON DELETE SET NULL,
      energy_count INTEGER,
      has_usdt BOOLEAN,
      usdt_balance NUMERIC(38, 6),
      provider_response JSONB,
      status TEXT NOT NULL,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_energy_requests_created
    ON energy_requests (created_at DESC)
  `);
}

async function closePool() {
  if (pool) {
    await pool.end();
  }
}

module.exports = {
  query,
  withTransaction,
  initDatabase,
  closePool,
};
