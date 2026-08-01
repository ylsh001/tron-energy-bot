const { query, withTransaction } = require('./db');

async function getRemaining(userId, dailyLimit) {
  const result = await query(
    'SELECT count FROM energy_claims WHERE user_id = $1 AND claim_date = CURRENT_DATE',
    [userId],
  );
  const count = result.rows[0]?.count || 0;
  return Math.max(0, dailyLimit - count);
}

async function consumeOne(userId, dailyLimit) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO energy_claims (user_id, claim_date, count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, claim_date)
       DO UPDATE SET count = energy_claims.count + 1, updated_at = NOW()
       RETURNING count`,
      [userId],
    );

    const count = result.rows[0].count;
    if (count > dailyLimit) {
      await client.query(
        `UPDATE energy_claims
         SET count = GREATEST(0, count - 1), updated_at = NOW()
         WHERE user_id = $1 AND claim_date = CURRENT_DATE`,
        [userId],
      );
      return false;
    }

    return true;
  });
}

async function refundOne(userId) {
  await query(
    `UPDATE energy_claims
     SET count = GREATEST(0, count - 1), updated_at = NOW()
     WHERE user_id = $1 AND claim_date = CURRENT_DATE`,
    [userId],
  );
}

module.exports = { getRemaining, consumeOne, refundOne };
