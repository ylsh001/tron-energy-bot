const express = require('express');
const config = require('../config');
const { validateInitData } = require('../services/telegramAuth');
const claimLimiter = require('../services/claimLimiter');
const {
  submitRunpodJob,
  getRunpodJobStatus,
  isTerminalStatus,
} = require('../services/runpod');
const {
  createRunpodJob,
  getRunpodJob,
  getActiveRunpodJob,
  updateRunpodJobStatus,
} = require('../services/runpodJobStore');

const router = express.Router();

const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const JOB_ID_REGEX = /^[A-Za-z0-9_-]{1,200}$/;

function getIdentity(req) {
  const initData = req.body && req.body.initData;
  return validateInitData(initData, config.botToken);
}

router.post('/run', async (req, res) => {
  const identity = getIdentity(req);
  if (!identity) {
    return res.status(401).json({
      error: 'Telegram 身份校验失败，请在 Telegram 内重新打开小程序',
    });
  }

  const toAddress = String(req.body?.toAddress || '').trim();
  if (!TRON_ADDRESS_REGEX.test(toAddress)) {
    return res.status(400).json({ error: '发送的目标地址格式不正确' });
  }

  if ((await claimLimiter.getRemaining(identity.userId, config.freeEnergyDailyLimit)) <= 0) {
    return res.status(429).json({ error: '今日免费领取次数已用完，请明天再来' });
  }

  const suffix = toAddress.slice(-5);
  const activeRecord = await getActiveRunpodJob(identity.userId, config.runpodJobTtlMs);

  if (activeRecord && activeRecord.suffix === suffix) {
    return res.status(200).json({
      success: true,
      jobId: activeRecord.id,
      status: activeRecord.status,
      reused: true,
    });
  }

  if (activeRecord && !isTerminalStatus(activeRecord.status)) {
    return res.status(409).json({
      error: '已有领取任务正在处理中，请稍后再试',
    });
  }

  try {
    const job = await submitRunpodJob({
      suffix,
      apiKey: config.runpodApiKey,
      endpointId: config.runpodEndpointId,
      timeoutSeconds: config.runpodTaskTimeoutSeconds,
    });

    const status = job.status || 'IN_QUEUE';
    await createRunpodJob({
      id: job.id,
      userId: identity.userId,
      suffix,
      toAddress,
      status,
      rawResponse: job,
    });

    return res.status(200).json({
      success: true,
      jobId: job.id,
      status,
      reused: false,
    });
  } catch (err) {
    console.error('RunPod 任务提交失败', err);
    return res.status(502).json({
      error: '领取任务提交失败，请稍后重试或联系客服',
    });
  }
});

router.post('/status', async (req, res) => {
  const identity = getIdentity(req);
  if (!identity) {
    return res.status(401).json({
      error: 'Telegram 身份校验失败，请在 Telegram 内重新打开小程序',
    });
  }

  const jobId = String(req.body?.jobId || '').trim();
  if (!JOB_ID_REGEX.test(jobId)) {
    return res.status(400).json({ error: '任务 ID 格式不正确' });
  }

  const record = await getRunpodJob(jobId);
  if (!record || record.user_id !== identity.userId) {
    return res.status(404).json({ error: '任务不存在或已失效，请重新领取' });
  }

  try {
    const data = await getRunpodJobStatus({
      jobId,
      apiKey: config.runpodApiKey,
      endpointId: config.runpodEndpointId,
    });

    const stored = await updateRunpodJobStatus(jobId, data);
    const status = stored.status;

    return res.status(200).json({
      success: true,
      jobId,
      status,
      address: stored.address || null,
      completed: status === 'COMPLETED',
      terminal: isTerminalStatus(status),
      error: stored.error || null,
    });
  } catch (err) {
    console.error('RunPod 状态查询失败', err);
    return res.status(502).json({
      error: '领取任务状态查询失败，请稍后重试',
    });
  }
});

module.exports = router;
