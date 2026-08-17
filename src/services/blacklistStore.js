const { query, withTransaction } = require('./db');
async function isUserBlacklisted(userId) { const result = await query('SELECT 1 FROM user_blacklist WHERE user_id = $1', [String(userId)]); return result.rowCount > 0; }
async function isAddressBlacklisted(address) { const normalizedAddress = String(address || '').trim(); if (!normalizedAddress) return false; const result = await query('SELECT 1 FROM address_blacklist WHERE address = $1', [normalizedAddress]); return result.rowCount > 0; }
async function isUserOrAddressBlacklisted(userId, addresses = []) {
  const normalizedAddresses = [...new Set(addresses.map((address) => String(address || '').trim()).filter(Boolean))];
  const [userBlocked, addressResult] = await Promise.all([isUserBlacklisted(userId), normalizedAddresses.length ? query('SELECT 1 FROM address_blacklist WHERE address = ANY($1::text[]) LIMIT 1', [normalizedAddresses]) : Promise.resolve({ rowCount: 0 })]);
  return userBlocked || addressResult.rowCount > 0;
}
async function upsertUserBlacklist(client, { userId, firstName, username, reason, source }) {
  const result = await client.query(`INSERT INTO user_blacklist (user_id, first_name, username, reason, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET first_name=COALESCE(EXCLUDED.first_name,user_blacklist.first_name), username=COALESCE(EXCLUDED.username,user_blacklist.username), reason=EXCLUDED.reason, source=EXCLUDED.source, updated_at=NOW() RETURNING *`, [String(userId), firstName || null, username || null, reason, source]); return result.rows[0];
}
async function upsertAddressBlacklist(client, { address, userId, firstName, username, reason, source }) {
  const normalizedAddress = String(address || '').trim(); if (!normalizedAddress) return null;
  const result = await client.query(`INSERT INTO address_blacklist (address,user_id,first_name,username,reason,source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (address) DO UPDATE SET user_id=COALESCE(EXCLUDED.user_id,address_blacklist.user_id), first_name=COALESCE(EXCLUDED.first_name,address_blacklist.first_name), username=COALESCE(EXCLUDED.username,address_blacklist.username), reason=EXCLUDED.reason, source=EXCLUDED.source, updated_at=NOW() RETURNING *`, [normalizedAddress, userId ? String(userId) : null, firstName || null, username || null, reason, source]); return result.rows[0];
}
async function addUserToBlacklist(data) { return withTransaction((client) => upsertUserBlacklist(client, { ...data, source: data.source || 'manual' })); }
async function addAddressToBlacklist(data) { return withTransaction((client) => upsertAddressBlacklist(client, { ...data, source: data.source || 'manual' })); }
async function addUserAndAddressToBlacklist(data) { return withTransaction(async (client) => ({ user: await upsertUserBlacklist(client, { ...data, source: data.source || 'automatic' }), address: await upsertAddressBlacklist(client, { ...data, source: data.source || 'automatic' }) })); }
async function removeUserFromBlacklist(userId) { await query('DELETE FROM user_blacklist WHERE user_id = $1', [String(userId)]); }
async function removeAddressFromBlacklist(address) { await query('DELETE FROM address_blacklist WHERE address = $1', [String(address || '').trim()]); }
async function listBlacklist() {
  const [users, addresses] = await Promise.all([query('SELECT * FROM user_blacklist ORDER BY created_at DESC'), query('SELECT * FROM address_blacklist ORDER BY created_at DESC')]);
  const map = (row) => ({ userId: row.user_id, firstName: row.first_name, username: row.username, reason: row.reason, source: row.source, createdAt: row.created_at, updatedAt: row.updated_at });
  return { users: users.rows.map(map), addresses: addresses.rows.map((row) => ({ address: row.address, ...map(row) })) };
}
async function hasSuccessfulClaimForAddress(address) { const result = await query(`SELECT 1 FROM energy_requests WHERE from_address = $1 AND status = 'success' LIMIT 1`, [address]); return result.rowCount > 0; }
module.exports = { isUserBlacklisted, isAddressBlacklisted, isUserOrAddressBlacklisted, addUserToBlacklist, addAddressToBlacklist, addUserAndAddressToBlacklist, removeUserFromBlacklist, removeAddressFromBlacklist, listBlacklist, hasSuccessfulClaimForAddress };