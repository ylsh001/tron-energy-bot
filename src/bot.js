const { Telegraf } = require('telegraf');
const config = require('./config');
const keyboards = require('./keyboards');

if (!config.botToken) {
  console.error('缺少 BOT_TOKEN，请在环境变量中配置 Telegram Bot Token');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

const WELCOME_TEXT = [
  '👋 欢迎使用 TRX 能量闪租机器人',
  '',
  '⚡ 转账没有能量？闪租能量帮你省手续费',
  `💰 可节省高达 ${config.feeSavePercent}% 的手续费`,
  '',
  '请选择下方菜单进行操作 👇',
].join('\n');

bot.start((ctx) => {
  return ctx.reply(WELCOME_TEXT, keyboards.mainMenuKeyboard());
});

bot.hears('⚡ TRX能量', (ctx) => {
  const text = [
    `给下面地址转${config.priceWithUsdt}TRX转U免手续费`,
    '1小时有效 节省百分之90费用',
    '',
    config.energyAddress || 'ENERGY_ADDRESS 未配置',
    '',
    '点击地址可以复制',
    '',
    `如果对方地址无U或者是交易所 需要双倍 就是${config.priceWithoutUsdt}TRX免费转U一次`,
    '',
    `转${config.priceWithUsdt}之后发现还需要大量TRX费用 那就是对面没U或者交易所，再给此地址转${config.priceWithUsdt}TRX就行`,
  ].join('\n');
  return ctx.reply(text, keyboards.energyInlineKeyboard());
});

bot.hears('👤 在线客服', (ctx) => {
  return ctx.reply('👤 遇到问题？点击下方按钮联系在线客服', keyboards.supportInlineKeyboard());
});

bot.hears('💱 U换TRX', (ctx) => {
  const text = [
    '💱 USDT 换 TRX',
    '',
    config.exchangeRateNote,
    '最低付款 1 USDT，最高 2000 USDT',
    '3秒完成兑换，请勿使用交易所提币',
    '',
    '兑换地址：',
    config.exchangeAddress,
    '',
    '👇 向以上地址转账，系统将自动完成兑换',
  ].join('\n');
  return ctx.reply(text, keyboards.exchangeInlineKeyboard());
});

bot.hears('🎁 每天每人送5次能量', (ctx) => {
  const text = [
    '🔥   最新活动',
    '🔥   每人每天送5次TRX能量',
    '🔥   请多多介绍朋友使用我们的机器人',
    '🔥   点击下面我们的小程序领取',
  ].join('\n');
  return ctx.reply(text, keyboards.freeEnergyInlineKeyboard());
});

bot.catch((err, ctx) => {
  console.error(`处理更新时出错 [${ctx.updateType}]`, err);
});

module.exports = bot;