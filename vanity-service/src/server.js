'use strict';

require('dotenv').config();

const express = require('express');
const vanityService = require('./vanityService');

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.VANITY_API_KEY || '';

if (!API_KEY) {
  console.error('未配置 VANITY_API_KEY，为安全起见服务拒绝启动。请在 .env 中设置该变量。');
  process.exit(1);
}

const app = express();
app.use(express.json());

function requireApiKey(req, res, next) {
  const key = req.get('X-API-Key');
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: '缺少或无效的 X-API-Key' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/tasks', requireApiKey, (req, res) => {
  const { suffix, caseSensitive, timeoutSeconds, workers } = req.body || {};
  try {
    const task = vanityService.createTask({ suffix, caseSensitive, timeoutSeconds, workers });
    res.status(202).json(task);
  } catch (err) {
    if (err instanceof vanityService.ValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('创建靓号任务失败', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.get('/tasks/:id', requireApiKey, (req, res) => {
  const consumeResult = req.query.consume !== 'false';
  const task = vanityService.getTask(req.params.id, { consumeResult });
  if (!task) {
    return res.status(404).json({ error: '任务不存在或已过期' });
  }
  res.json(task);
});

app.delete('/tasks/:id', requireApiKey, (req, res) => {
  const ok = vanityService.cancelTask(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: '任务不存在' });
  }
  res.json({ status: 'cancelled' });
});

app.listen(PORT, () => {
  console.log(`TRON 靓号生成服务已启动，监听端口 ${PORT}`);
});

process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));
