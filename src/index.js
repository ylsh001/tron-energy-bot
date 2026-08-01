const path = require('path');
const express = require('express');
const config = require('./config');
const bot = require('./bot');
const energyRoutes = require('./routes/energyRoutes');

const app = express();

app.use(express.json());
app.use('/webapp', express.static(path.join(__dirname, '..', 'public', 'webapp')));
app.use('/api/energy', energyRoutes);

app.get('/', (_req, res) => {
  res.status(200).send('TRON 能量闪租机器人运行中');
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(config.port, () => {
  console.log(`健康检查服务已启动，监听端口 ${config.port}`);
});

bot
  .launch()
  .then(() => {
    console.log('Telegram Bot 已启动（长轮询模式）');
  })
  .catch((err) => {
    console.error('Bot 启动失败', err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
