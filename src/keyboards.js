const { Markup } = require('telegraf');
const config = require('./config');

// 主菜单（Reply Keyboard 常驻菜单）
function mainMenuKeyboard() {
  return Markup.keyboard([
    ['⚡ TRX能量', '👤 在线客服'],
    ['💱 U换TRX', '🎁 每天每人送5次能量'],
  ])
    .resize()
    .persistent();
}

// TRX能量页：地址点击自动复制 + 客服按钮
function energyInlineKeyboard() {
  return Markup.inlineKeyboard([
    [
      {
        text: `📋 点击复制地址：${config.energyAddress}`,
        copy_text: { text: config.energyAddress },
      },
    ],
    [Markup.button.url('👤 联系客服', `https://t.me/${config.supportUsername}`)],
  ]);
}

// 在线客服跳转按钮
function supportInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('👤 立即联系客服', `https://t.me/${config.supportUsername}`)],
  ]);
}

// U换TRX 页：仅展示，联系客服处理
function exchangeInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('👤 联系客服兑换', `https://t.me/${config.supportUsername}`)],
  ]);
}

// 每天每人送5次能量 —— 跳转 Telegram 小程序
function freeEnergyInlineKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🎁 立即领取5次能量', config.webAppUrl)],
  ]);
}

module.exports = {
  mainMenuKeyboard,
  energyInlineKeyboard,
  supportInlineKeyboard,
  exchangeInlineKeyboard,
  freeEnergyInlineKeyboard,
};
