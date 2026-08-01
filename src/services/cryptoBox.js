const crypto = require('crypto');
const config = require('../config');

function getKey() {
  if (!config.dataEncryptionSecret) {
    return null;
  }
  return crypto.createHash('sha256').update(config.dataEncryptionSecret).digest();
}

function encryptText(text) {
  const key = getKey();
  if (!key || !text) {
    return null;
  }

  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptText(payload) {
  const key = getKey();
  if (!key || !payload?.encrypted || !payload?.nonce || !payload?.tag) {
    return null;
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

module.exports = { encryptText, decryptText };
