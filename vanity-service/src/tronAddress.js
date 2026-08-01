'use strict';

const crypto = require('crypto');
const { keccak256 } = require('js-sha3');

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer) {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let leadingZeros = 0;
  while (leadingZeros < buffer.length && buffer[leadingZeros] === 0) {
    leadingZeros++;
  }

  let result = BASE58_ALPHABET[0].repeat(leadingZeros);
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

function derivePublicKey(privateKeyBuffer) {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(privateKeyBuffer);
  return ecdh.getPublicKey(null, 'uncompressed');
}

function deriveTronAddress(privateKeyBuffer) {
  const publicKey = derivePublicKey(privateKeyBuffer);
  const publicKeyBody = publicKey.subarray(1);
  const hashHex = keccak256(publicKeyBody);
  const hashBuffer = Buffer.from(hashHex, 'hex');
  const addressBytes = Buffer.concat([Buffer.from([0x41]), hashBuffer.subarray(-20)]);
  const checksum1 = crypto.createHash('sha256').update(addressBytes).digest();
  const checksum2 = crypto.createHash('sha256').update(checksum1).digest();
  const fullPayload = Buffer.concat([addressBytes, checksum2.subarray(0, 4)]);
  return base58Encode(fullPayload);
}

function selfCheck() {
  const privateKey = Buffer.alloc(32);
  privateKey[31] = 1;
  const publicKey = derivePublicKey(privateKey);
  const hashHex = keccak256(publicKey.subarray(1));
  const ethAddress = hashHex.slice(-40);
  const expected = '7e5f4552091a69125d5dfcb7b8c2659029395bdf';
  if (ethAddress !== expected) {
    throw new Error(
      `自检失败: Keccak256/secp256k1 地址推导逻辑异常 (得到 ${ethAddress}, 期望 ${expected})`
    );
  }
}

module.exports = {
  deriveTronAddress,
  derivePublicKey,
  selfCheck,
  BASE58_ALPHABET,
};
