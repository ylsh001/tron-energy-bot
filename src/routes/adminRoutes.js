const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { listAdminRecords } = require('../services/runpodJobStore');

const router = express.Router();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  if (!config.adminPassword) {
    if (req.accepts('html')) {
      return res.status(503).send('ADMIN_PASSWORD 未配置，管理后台不可用');
    }
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

router.get('/records', requireAdmin, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  try {
    const records = await listAdminRecords({ limit, offset });
    return res.status(200).json({ records });
  } catch (err) {
    console.error('管理后台查询失败', err);
    return res.status(500).json({ error: '管理后台查询失败' });
  }
});

module.exports = { router, requireAdmin };
