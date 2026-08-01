'use strict';

const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const { selfCheck } = require('./tronAddress');

selfCheck();

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MAX_SUFFIX_LENGTH = 6;
const MAX_TIMEOUT_SECONDS = 600;
const DEFAULT_TIMEOUT_SECONDS = 120;
const TASK_TTL_MS = 30 * 60 * 1000;
const MAX_CONCURRENT_TASKS = 1;

const tasks = new Map();
const pendingQueue = [];
let runningCount = 0;

function estimateProbability(suffix, caseSensitive) {
  let p = 1;
  for (const ch of suffix) {
    if (caseSensitive) {
      p *= 1 / 58;
    } else {
      const isLetter = /[a-zA-Z]/.test(ch);
      p *= isLetter ? 2 / 58 : 1 / 58;
    }
  }
  return p;
}

class ValidationError extends Error {}

function validateParams({ suffix, caseSensitive, timeoutSeconds, workers }) {
  if (!suffix || typeof suffix !== 'string') {
    throw new ValidationError('suffix 为必填字符串');
  }
  if (suffix.length > MAX_SUFFIX_LENGTH) {
    throw new ValidationError(`suffix 长度不能超过 ${MAX_SUFFIX_LENGTH} 位，位数越多耗时呈指数增长`);
  }
  if (!BASE58_RE.test(suffix)) {
    throw new ValidationError('suffix 包含非法字符：TRON 地址为 Base58 编码，不含 0、O、I、l');
  }

  const normalizedTimeout = Number.isFinite(timeoutSeconds) ? timeoutSeconds : DEFAULT_TIMEOUT_SECONDS;
  if (normalizedTimeout <= 0 || normalizedTimeout > MAX_TIMEOUT_SECONDS) {
    throw new ValidationError(`timeoutSeconds 必须在 1 到 ${MAX_TIMEOUT_SECONDS} 之间`);
  }

  const maxWorkers = os.cpus().length;
  const normalizedWorkers = Number.isFinite(workers)
    ? Math.min(Math.max(1, Math.floor(workers)), maxWorkers)
    : maxWorkers;

  return {
    suffix,
    caseSensitive: !!caseSensitive,
    timeoutSeconds: normalizedTimeout,
    workers: normalizedWorkers,
  };
}

function createTask(params) {
  const normalized = validateParams(params);
  const id = crypto.randomUUID();
  const task = {
    id,
    status: 'queued',
    suffix: normalized.suffix,
    caseSensitive: normalized.caseSensitive,
    timeoutSeconds: normalized.timeoutSeconds,
    workers: normalized.workers,
    probability: estimateProbability(normalized.suffix, normalized.caseSensitive),
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    totalAttempts: 0,
    result: null,
    resultConsumed: false,
    error: null,
    _workerHandles: [],
    _timeoutHandle: null,
  };

  tasks.set(id, task);
  pendingQueue.push(id);
  scheduleNext();
  scheduleCleanup(task);

  return sanitizeTask(task);
}

function scheduleNext() {
  if (runningCount >= MAX_CONCURRENT_TASKS) return;
  const nextId = pendingQueue.shift();
  if (!nextId) return;

  const task = tasks.get(nextId);
  if (!task || task.status !== 'queued') {
    scheduleNext();
    return;
  }

  startTask(task);
}

function startTask(task) {
  runningCount++;
  task.status = 'running';
  task.startedAt = Date.now();

  const onFinish = () => {
    runningCount--;
    scheduleNext();
  };

  task._timeoutHandle = setTimeout(() => {
    if (task.status === 'running') {
      terminateWorkers(task);
      task.status = 'timeout';
      task.finishedAt = Date.now();
      onFinish();
    }
  }, task.timeoutSeconds * 1000);

  for (let i = 0; i < task.workers; i++) {
    const worker = new Worker(path.join(__dirname, 'vanityWorker.js'), {
      workerData: {
        suffix: task.suffix,
        caseSensitive: task.caseSensitive,
        reportIntervalMs: 1000,
      },
    });

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        task.totalAttempts += msg.attempts;
      } else if (msg.type === 'found' && task.status === 'running') {
        task.totalAttempts += msg.attempts;
        task.status = 'found';
        task.finishedAt = Date.now();
        task.result = { privateKey: msg.privateKey, address: msg.address };
        clearTimeout(task._timeoutHandle);
        terminateWorkers(task);
        onFinish();
      }
    });

    worker.on('error', (err) => {
      if (task.status === 'running') {
        task.status = 'error';
        task.error = err.message;
        task.finishedAt = Date.now();
        clearTimeout(task._timeoutHandle);
        terminateWorkers(task);
        onFinish();
      }
    });

    task._workerHandles.push(worker);
  }
}

function terminateWorkers(task) {
  task._workerHandles.forEach((w) => w.terminate().catch(() => {}));
  task._workerHandles = [];
}

function scheduleCleanup(task) {
  setTimeout(() => {
    if (task.status === 'running' || task.status === 'queued') return;
    tasks.delete(task.id);
  }, TASK_TTL_MS);
}

function sanitizeTask(task, { includeResult = false } = {}) {
  const base = {
    id: task.id,
    status: task.status,
    suffix: task.suffix,
    caseSensitive: task.caseSensitive,
    timeoutSeconds: task.timeoutSeconds,
    workers: task.workers,
    expectedAttempts: Math.round(1 / task.probability),
    totalAttempts: task.totalAttempts,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    error: task.error,
  };

  if (task.status === 'found') {
    base.resultConsumed = task.resultConsumed;
    if (includeResult && !task.resultConsumed) {
      base.result = task.result;
      task.resultConsumed = true;
      task.result = null;
    } else if (!includeResult) {
      base.result = task.resultConsumed ? null : { address: task.result ? task.result.address : null };
    }
  }

  return base;
}

function getTask(id, { consumeResult = false } = {}) {
  const task = tasks.get(id);
  if (!task) return null;
  return sanitizeTask(task, { includeResult: consumeResult });
}

function cancelTask(id) {
  const task = tasks.get(id);
  if (!task) return false;
  if (task.status === 'running') {
    clearTimeout(task._timeoutHandle);
    terminateWorkers(task);
    runningCount--;
    scheduleNext();
  }
  if (task.status === 'queued') {
    const idx = pendingQueue.indexOf(id);
    if (idx !== -1) pendingQueue.splice(idx, 1);
  }
  task.status = 'cancelled';
  task.finishedAt = Date.now();
  return true;
}

module.exports = {
  createTask,
  getTask,
  cancelTask,
  ValidationError,
  MAX_SUFFIX_LENGTH,
  MAX_TIMEOUT_SECONDS,
};
