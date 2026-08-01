'use strict';

const crypto = require('crypto');
const { parentPort, workerData } = require('worker_threads');
const { deriveTronAddress } = require('./tronAddress');

const { suffix, caseSensitive, reportIntervalMs } = workerData;
const targetSuffix = caseSensitive ? suffix : suffix.toLowerCase();

let attempts = 0;
let lastReportTime = Date.now();
let lastReportAttempts = 0;

function matchesSuffix(address) {
  const tail = address.slice(-suffix.length);
  return caseSensitive ? tail === targetSuffix : tail.toLowerCase() === targetSuffix;
}

function loop() {
  const batchSize = 500;
  for (let i = 0; i < batchSize; i++) {
    const privateKey = crypto.randomBytes(32);
    let address;
    try {
      address = deriveTronAddress(privateKey);
    } catch (err) {
      continue;
    }
    attempts++;

    if (matchesSuffix(address)) {
      parentPort.postMessage({
        type: 'found',
        privateKey: privateKey.toString('hex'),
        address,
        attempts,
      });
      return;
    }
  }

  const now = Date.now();
  if (now - lastReportTime >= reportIntervalMs) {
    parentPort.postMessage({
      type: 'progress',
      attempts: attempts - lastReportAttempts,
      totalAttempts: attempts,
    });
    lastReportTime = now;
    lastReportAttempts = attempts;
  }

  setImmediate(loop);
}

loop();
