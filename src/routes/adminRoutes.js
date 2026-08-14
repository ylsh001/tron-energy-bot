const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { listAdminRecords, getAdminStats } = require('../services/runpodJobStore');
const {
  getStatus: getMonitorStatus,
  setEnabled: setMonitorEnabled,
  refreshNow: refreshMonitorNow,
} = require('../services/usdtBalanceMonitor');
const { listBlacklist, addUserToBlacklist, removeUserFromBlacklist } = require('../services/blacklistStore');

const router = express.Router();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  if (!config.adminPassword) {
    if (req.accepts('html')) return res.status(503).send('ADMIN_PASSWORD 未配置，管理后台不可用');
    return res.status(503).json({ error: 'ADMIN_PASSWORD 未配置，管理后台不可用' });
  }
  const header = req.get('authorization') || '';
  const [type, value] = header.split(' ');
  if (type !== 'Basic' || !value) {
    res.set('WWW-Authenticate', 'Basic realm="tbot-admin"');
    return res.status(401).send(req.accepts('html') ? '需要管理后台账号密码' : JSON.stringify({ error: '需要管理后台账号密码' }));
  }
  let username;
  let password;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const index = decoded.indexOf(':');
    username = decoded.slice(0, index);
    password = decoded.slice(index + 1);
  } catch (err) {
    return res.status(401).json({ error: '认证信息无效' });
  }
  if (!safeEqual(username, config.adminUsername) || !safeEqual(password, config.adminPassword)) {
    res.set('WWW-Authenticate', 'Basic realm="tbot-admin"');
    return res.status(401).send(req.accepts('html') ? '账号或密码错误' : JSON.stringify({ error: '账号或密码错误' }));
  }
  next();
}

router.get('/blacklist', requireAdmin, async (_req, res) => {
  try { return res.status(200).json({ users: await listBlacklist() }); }
  catch (err) { console.error('黑名单查询失败', err); return res.status(500).json({ error: '黑名单查询失败' }); }
});

router.post('/blacklist', requireAdmin, async (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  if (!/^\d+$/.test(userId)) return res.status(400).json({ error: 'Telegram 用户 ID 格式不正确' });
  try {
    const user = await addUserToBlacklist({
      userId, firstName: String(req.body?.firstName || '').trim(),
      username: String(req.body?.username || '').trim().replace(/^@/, ''),
      reason: String(req.body?.reason || '').trim() || '管理员手动添加', source: 'manual',
    });
    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('黑名单添加失败', err);
    return res.status(500).json({ error: '黑名单添加失败' });
  }
});

router.delete('/blacklist/:userId', requireAdmin, async (req, res) => {
  try { await removeUserFromBlacklist(req.params.userId); return res.status(200).json({ success: true }); }
  catch (err) { console.error('黑名单删除失败', err); return res.status(500).json({ error: '黑名单删除失败' }); }
});

router.get('/monitor', requireAdmin, (_req, res) => res.status(200).json({ monitor: getMonitorStatus() }));

router.post('/monitor', requireAdmin, async (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'enabled 必须是布尔值' });
  try {
    const monitor = await setMonitorEnabled(req.body.enabled);
    return res.status(200).json({ success: true, monitor });
  } catch (err) {
    console.error('USDT 余额监控设置失败', err);
    return res.status(500).json({ error: 'USDT 余额监控设置失败' });
  }
});

router.post('/monitor/refresh', requireAdmin, async (_req, res) => {
  try {
    const monitor = await refreshMonitorNow();
    return res.status(200).json({ success: true, monitor });
  } catch (err) {
    console.error('USDT 余额立即查询失败', err);
    return res.status(502).json({ error: 'USDT 余额立即查询失败', monitor: getMonitorStatus() });
  }
});

router.get('/records', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  try {
    const withUsdt = req.query.withUsdt === 'true';
    const [records, stats] = await Promise.all([listAdminRecords({ limit, offset, withUsdt }), getAdminStats()]);
    return res.status(200).json({ records, stats, monitor: getMonitorStatus() });
  } catch (err) {
    console.error('管理后台查询失败', err);
    return res.status(500).json({ error: '管理后台查询失败' });
  }
});

module.exports = { router, requireAdmin };
