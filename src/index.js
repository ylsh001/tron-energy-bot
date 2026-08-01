const path = require('path');
const express = require('express');
const config = require('./config');
const bot = require('./bot');
const { initDatabase, closePool } = require('./services/db');
const energyRoutes = require('./routes/energyRoutes');
const runpodRoutes = require('./routes/runpodRoutes');
const { router: adminRoutes, requireAdmin } = require('./routes/adminRoutes');

const app = express();

app.use(express.json());
app.use('/webapp', express.static(path.join(__dirname, '..', 'public', 'webapp')));
app.use('/admin', requireAdmin, express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/api/runpod', runpodRoutes);
app.use('/api/energy', energyRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (_req, res) => {
  res.status(200).send('TRON 能量闪租机器人运行中');
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

async function start() {
  try {
    await initDatabase();

    app.listen(config.port, '0.0.0.0', () => {
      console.log(`健康检查服务已启动，监听端口 ${config.port}`);
    });

    await bot.launch();
    console.log('Telegram Bot 已启动（长轮询模式）');
  } catch (err) {
    console.error('服务启动失败', err);
    process.exit(1);
  }
}

start();

async function shutdown(signal) {
  bot.stop(signal);
  await closePool();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
