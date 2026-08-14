const express = require('express');
const config = require('../config');
const { validateInitData } = require('../services/telegramAuth');
const { requestEnergy } = require('../services/energyProvider');
const { getEnergyBalance, getUsdtBalance } = require('../services/tronGrid');
const { isUserBlacklisted, addUserToBlacklist, hasSuccessfulClaimForAddress } = require('../services/blacklistStore');
const { getRunpodJob, updateRunpodJobUsdtBalance } = require('../services/runpodJobStore');
const claimLimiter = require('../services/claimLimiter');
const { query } = require('../services/db');

const router = express.Router();

router.post('/profile', async (req, res) => {
  const identity = validateInitData(req.body?.initData, config.botToken);
  if (!identity) return res.status(401).json({ error: 'Telegram 身份校验失败，请在 Telegram 内重新打开小程序' });
  try {
    const remainingToday = await claimLimiter.getRemaining(identity.userId, config.freeEnergyDailyLimit);
    return res.status(200).json({ success: true, userId: identity.userId, firstName: identity.firstName || '', username: identity.username || '', remainingToday, dailyLimit: config.freeEnergyDailyLimit });
  } catch (err) {
    console.error('用户资料查询失败', err);
    return res.status(500).json({ error: '用户资料查询失败' });
  }
});

const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const JOB_ID_REGEX = /^[A-Za-z0-9_-]{1,200}$/;

async function recordEnergyRequest(values) {
  await query(
    `INSERT INTO energy_requests (
       user_id, first_name, username, from_address, to_address, runpod_job_id,
       energy_count, has_usdt, usdt_balance, provider_response, status, error
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [values.userId, values.firstName || null, values.username || null, values.fromAddress,
      values.toAddress, values.runpodJobId || null, values.energyCount || null, values.hasUsdt,
      values.usdtBalance, values.providerResponse || null, values.status, values.error || null],
  );
}

router.post('/request', async (req, res) => {
  const { initData, fromAddress, toAddress } = req.body || {};
  const runpodJobId = String(req.body?.runpodJobId || '').trim();
  const identity = validateInitData(initData, config.botToken);
  if (!identity) return res.status(401).json({ error: 'Telegram 身份校验失败，请在 Telegram 内重新打开小程序' });
  if (!fromAddress || !TRON_ADDRESS_REGEX.test(fromAddress)) return res.status(400).json({ error: '需要能量的地址格式不正确' });
  if (!toAddress || !TRON_ADDRESS_REGEX.test(toAddress)) return res.status(400).json({ error: '发送的目标地址格式不正确' });
  if (!JOB_ID_REGEX.test(runpodJobId)) return res.status(400).json({ error: '任务 ID 格式不正确' });

  const job = await getRunpodJob(runpodJobId);
  if (!job || job.user_id !== identity.userId || job.status !== 'COMPLETED' || job.from_address !== fromAddress || job.to_address !== toAddress) return res.status(403).json({ blocked: true });
  if (await isUserBlacklisted(identity.userId)) return res.status(403).json({ blocked: true });

  const tronGridOptions = { tronGridBaseUrl: config.tronGridBaseUrl, tronGridApiKey: config.tronGridApiKey };
  const currentEnergy = await getEnergyBalance(fromAddress, tronGridOptions);
  if (currentEnergy > 130000) return res.status(403).json({ blocked: true });

  const resultAddress = String(job.result_address || '').trim();
  const hadSuccessfulClaim = await hasSuccessfulClaimForAddress(fromAddress, identity.userId);
  const usdtCheckedAt = new Date();
  const resultAddressUsdt = resultAddress ? await getUsdtBalance(resultAddress, tronGridOptions) : '0';
  await updateRunpodJobUsdtBalance(runpodJobId, resultAddressUsdt, usdtCheckedAt);
  if (hadSuccessfulClaim && currentEnergy <= 0 && Number(resultAddressUsdt) <= 0) {
    await addUserToBlacklist({ userId: identity.userId, firstName: identity.firstName, username: identity.username, reason: '历史领取地址能量已耗尽且本次返回地址无 USDT', source: 'automatic' });
    return res.status(403).json({ blocked: true });
  }

  const remainingBefore = await claimLimiter.getRemaining(identity.userId, config.freeEnergyDailyLimit);
  if (remainingBefore <= 0) return res.status(429).json({ error: '今日免费领取次数已用完，请明天再来' });
  const consumed = await claimLimiter.consumeOne(identity.userId, config.freeEnergyDailyLimit);
  if (!consumed) return res.status(429).json({ error: '今日免费领取次数已用完，请明天再来' });

  const usdtBalance = resultAddressUsdt;
  const hasUsdt = Number(resultAddressUsdt) > 0;
  const energyCount = 131000;
  try {
    const result = await requestEnergy({ address: fromAddress, count: energyCount, period: config.energyProviderPeriod, apiBaseUrl: config.energyProviderApiUrl, apiKey: config.energyProviderApiKey, apiSecret: config.energyProviderApiSecret, proxyUrl: config.energyProviderProxyUrl });
    await recordEnergyRequest({ userId: identity.userId, firstName: identity.firstName, username: identity.username, fromAddress, toAddress, runpodJobId, energyCount, hasUsdt, usdtBalance, providerResponse: result, status: 'success' });
    const remainingAfter = await claimLimiter.getRemaining(identity.userId, config.freeEnergyDailyLimit);
    return res.status(200).json({ success: true, energyCount, hasUsdt, usdtBalance, remainingToday: remainingAfter, provider: result });
  } catch (err) {
    await claimLimiter.refundOne(identity.userId);
    await recordEnergyRequest({ userId: identity.userId, firstName: identity.firstName, username: identity.username, fromAddress, toAddress, runpodJobId, energyCount, hasUsdt, usdtBalance, status: 'failed', error: err.message });
    console.error('能量领取失败', err);
    return res.status(502).json({ error: '能量领取失败，请稍后重试或联系客服' });
  }
});

module.exports = router;
