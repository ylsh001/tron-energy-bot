const express = require('express');
const config = require('../config');
const { validateInitData } = require('../services/telegramAuth');
const { hasUsdtBalance } = require('../services/tronGrid');
const { requestEnergy } = require('../services/energyProvider');
const claimLimiter = require('../services/claimLimiter');

const router = express.Router();

const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

router.post('/request', async (req, res) => {
  const { initData, fromAddress, toAddress } = req.body || {};

  const identity = validateInitData(initData, config.botToken);
  if (!identity) {
    return res.status(401).json({ error: 'Telegram 身份校验失败，请在 Telegram 内重新打开小程序' });
  }

  if (!fromAddress || !TRON_ADDRESS_REGEX.test(fromAddress)) {
    return res.status(400).json({ error: '需要能量的地址格式不正确' });
  }
  if (!toAddress || !TRON_ADDRESS_REGEX.test(toAddress)) {
    return res.status(400).json({ error: '发送的目标地址格式不正确' });
  }

  const remainingBefore = claimLimiter.getRemaining(identity.userId, config.freeEnergyDailyLimit);
  if (remainingBefore <= 0) {
    return res.status(429).json({ error: '今日免费领取次数已用完，请明天再来' });
  }

  const consumed = claimLimiter.consumeOne(identity.userId, config.freeEnergyDailyLimit);
  if (!consumed) {
    return res.status(429).json({ error: '今日免费领取次数已用完，请明天再来' });
  }

  try {
    const hasUsdt = await hasUsdtBalance(toAddress, {
      tronGridBaseUrl: config.tronGridBaseUrl,
      tronGridApiKey: config.tronGridApiKey,
    });

    const energyCount = hasUsdt ? config.freeEnergyCountWithUsdt : config.freeEnergyCountWithoutUsdt;

    const result = await requestEnergy({
      address: fromAddress,
      count: energyCount,
      resourceType: 'energy',
      apiBaseUrl: config.energyProviderApiUrl,
      apiKey: config.energyProviderApiKey,
      apiSecret: config.energyProviderApiSecret,
    });

    const remainingAfter = claimLimiter.getRemaining(identity.userId, config.freeEnergyDailyLimit);

    return res.status(200).json({
      success: true,
      energyCount,
      hasUsdt,
      remainingToday: remainingAfter,
      provider: result,
    });
  } catch (err) {
    claimLimiter.refundOne(identity.userId);
    console.error('能量领取失败', err);
    return res.status(502).json({ error: '能量领取失败，请稍后重试或联系客服' });
  }
});

module.exports = router;
