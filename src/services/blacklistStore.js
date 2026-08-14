const { query } = require('./db');

async function isUserBlacklisted(userId) {
  const result = await query('SELECT 1 FROM user_blacklist WHERE user_id = $1', [String(userId)]);
  return result.rowCount > 0;
}

async function addUserToBlacklist({ userId, firstName, username, reason, source = 'manual' }) {
  const result = await query(
    `INSERT INTO user_blacklist (user_id, first_name, username, reason, source)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       first_name = COALESCE(EXCLUDED.first_name, user_blacklist.first_name),
       username = COALESCE(EXCLUDED.username, user_blacklist.username),
       reason = EXCLUDED.reason,
       source = EXCLUDED.source,
       updated_at = NOW()
     RETURNING *`,
    [String(userId), firstName || null, username || null, reason, source],
  );
  return result.rows[0];
}

async function removeUserFromBlacklist(userId) {
  const result = await query('DELETE FROM user_blacklist WHERE user_id = $1', [String(userId)]);
  return result.rowCount > 0;
}

async function listBlacklist() {
  const result = await query(
    `SELECT user_id, first_name, username, reason, source, created_at, updated_at
     FROM user_blacklist
     ORDER BY created_at DESC`,
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    firstName: row.first_name,
    username: row.username,
    reason: row.reason,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function hasSuccessfulClaimForAddress(address, userId) {
  const result = await query(
    `SELECT 1 FROM energy_requests
     WHERE from_address = $1 AND user_id = $2 AND status = 'success'
     LIMIT 1`,
    [address, String(userId)],
  );
  return result.rowCount > 0;
}

module.exports = {
  isUserBlacklisted,
  addUserToBlacklist,
  removeUserFromBlacklist,
  listBlacklist,
  hasSuccessfulClaimForAddress,
};
