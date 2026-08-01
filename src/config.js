require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] || fallback;
  return value;
}

module.exports = {
  botToken: process.env.BOT_TOKEN,
  port: process.env.PORT || 3000,

  energyAddress: required('ENERGY_ADDRESS', 'TDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
  webAppUrl: required('WEBAPP_URL', 'https://your-miniapp-domain.example.com'),
  supportUsername: required('SUPPORT_USERNAME', 'your_support_username'),

  priceWithUsdt: required('PRICE_WITH_USDT', '1.5'),
  priceWithoutUsdt: required('PRICE_WITHOUT_USDT', '3'),
  feeSavePercent: required('FEE_SAVE_PERCENT', '80'),

  exchangeRateNote: required('EXCHANGE_RATE_NOTE', 'U换TRX比例请以客服实时汇率为准'),

  freeEnergyDailyLimit: Number(required('FREE_ENERGY_DAILY_LIMIT', '5')),
  freeEnergyCountWithUsdt: Number(required('FREE_ENERGY_COUNT_WITH_USDT', '65000')),
  freeEnergyCountWithoutUsdt: Number(required('FREE_ENERGY_COUNT_WITHOUT_USDT', '130000')),

  tronGridBaseUrl: required('TRONGRID_BASE_URL', 'https://api.trongrid.io'),
  tronGridApiKey: process.env.TRONGRID_API_KEY || '',

  energyProviderApiUrl: process.env.ENERGY_PROVIDER_API_URL || '',
  energyProviderApiKey: process.env.ENERGY_PROVIDER_API_KEY || '',
  energyProviderApiSecret: process.env.ENERGY_PROVIDER_API_SECRET || '',
};
