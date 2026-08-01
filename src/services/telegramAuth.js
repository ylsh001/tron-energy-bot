const crypto = require('crypto');

function validateInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string' || !botToken) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return null;
  }
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) {
    return null;
  }

  const authDate = Number(params.get('auth_date'));
  if (Number.isFinite(authDate)) {
    const ageSeconds = Date.now() / 1000 - authDate;
    if (ageSeconds > 86400 || ageSeconds < -60) {
      return null;
    }
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    return null;
  }

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch (err) {
    return null;
  }

  if (!user || !user.id) {
    return null;
  }

  return {
    userId: String(user.id),
    firstName: user.first_name,
    username: user.username,
  };
}

module.exports = { validateInitData };
