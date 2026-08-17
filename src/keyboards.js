const { Markup } = require('telegraf');
const config = require('./config');

function mainMenuKeyboard() {
  return Markup.keyboard([['⚡ TRX能量', '👤 在线客服'], ['💱 U换TRX', '🎁 每天每人送5次能量']]).resize().persistent();
}
function energyInlineKeyboard() {
  const rows = [];
  if (config.energyAddress) rows.push([{ text: '📋 点击复制', copy_text: { text: config.energyAddress } }]);
  rows.push([Markup.button.url('👤 联系客服', `https://t.me/${config.supportUsername}`)]);
  return Markup.inlineKeyboard(rows);
}
function supportInlineKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.url('👤 立即联系客服', `https://t.me/${config.supportUsername}`)]]);
}
function exchangeInlineKeyboard() {
  return Markup.inlineKeyboard([[{ text: '📋 点击复制', copy_text: { text: config.exchangeAddress } }]]);
}
function freeEnergyInlineKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.webApp('🎁 立即领取5次能量', config.webAppUrl)]]);
}
module.exports = { mainMenuKeyboard, energyInlineKeyboard, supportInlineKeyboard, exchangeInlineKeyboard, freeEnergyInlineKeyboard };