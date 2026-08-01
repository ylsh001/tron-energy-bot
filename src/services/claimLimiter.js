const claimsByUser = new Map();

function getTodayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
}

function getRemaining(userId, dailyLimit) {
  const record = claimsByUser.get(userId);
  const todayKey = getTodayKey();
  if (!record || record.dayKey !== todayKey) {
    return dailyLimit;
  }
  return Math.max(0, dailyLimit - record.count);
}

function consumeOne(userId, dailyLimit) {
  const todayKey = getTodayKey();
  const record = claimsByUser.get(userId);

  if (!record || record.dayKey !== todayKey) {
    claimsByUser.set(userId, { dayKey: todayKey, count: 1 });
    return true;
  }

  if (record.count >= dailyLimit) {
    return false;
  }

  record.count += 1;
  return true;
}

function refundOne(userId) {
  const todayKey = getTodayKey();
  const record = claimsByUser.get(userId);
  if (record && record.dayKey === todayKey && record.count > 0) {
    record.count -= 1;
  }
}

module.exports = { getRemaining, consumeOne, refundOne };
