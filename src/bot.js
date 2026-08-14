const { Telegraf } = require('telegraf');
const config = require('./config');
const keyboards = require('./keyboards');
if (!config.botToken) { console.error('缺少 BOT_TOKEN，请在环境变量中配置 Telegram Bot Token'); process.exit(1); }
const bot = new Telegraf(config.botToken);
const WELCOME_TEXT = ['👋 欢迎使用 TRX 能量闪租机器人', '', '⚡ 转账没有能量？闪租能量帮你省手续费', `💰 可节省高达 ${config.feeSavePercent}% 的手续费`, '', '请选择下方菜单进行操作 👇'].join('\n');
bot.start((ctx) => ctx.reply(WELCOME_TEXT, keyboards.mainMenuKeyboard()));
bot.hears('⚡ TRX能量', (ctx) => { const text = ['⚡ TRX能量闪租', '', `✅ 1笔转账 = ${config.priceWithUsdt} TRX（对方地址有U）`, `✅ 1笔转账 = ${config.priceWithoutUsdt} TRX（对方地址无U）`, `💰 比直接转账节省约 ${config.feeSavePercent}% 手续费`, '', '👇 向下方地址转入对应数量的 TRX，系统将自动为你的目标地址闪租能量'].join('\n'); return ctx.reply(text, keyboards.energyInlineKeyboard()); });
bot.hears('👤 在线客服', (ctx) => ctx.reply('👤 遇到问题？点击下方按钮联系在线客服', keyboards.supportInlineKeyboard()));
bot.hears('💱 U换TRX', (ctx) => { const text = ['💱 USDT 换 TRX', '', config.exchangeRateNote, '最低付款 1 USDT，最高 2000 USDT', '3秒完成兑换，请勿使用交易所提币', '', '👇 向下方地址转账，系统将自动完成兑换'].join('\n'); return ctx.reply(text, keyboards.exchangeInlineKeyboard()); });
bot.hears('🎁 每天每人送5次能量', (ctx) => { const text = ['🎁 每天每人免费送5次能量', '', '👇 点击下方按钮进入小程序立即领取'].join('\n'); return ctx.reply(text, keyboards.freeEnergyInlineKeyboard()); });
bot.catch((err, ctx) => console.error(`处理更新时出错 [${ctx.updateType}]`, err));
module.exports = bot;
