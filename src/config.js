require('dotenv').config();

function required(name, fallback) {
  return process.env[name] || fallback;
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

  runpodApiKey: process.env.RUNPOD_API_KEY || '',
  runpodEndpointId: process.env.RUNPOD_ENDPOINT_ID || '',
  runpodTaskTimeoutSeconds: Number(required('RUNPOD_TASK_TIMEOUT_SECONDS', '600')),
  runpodPollIntervalMs: Number(required('RUNPOD_POLL_INTERVAL_MS', '5000')),
  runpodJobTtlMs: Number(required('RUNPOD_JOB_TTL_MS', '900000')),

  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: required('DATABASE_SSL', 'false') === 'true',
  dataEncryptionSecret: process.env.DATA_ENCRYPTION_SECRET || '',
  adminUsername: required('ADMIN_USERNAME', 'admin'),
  adminPassword: process.env.ADMIN_PASSWORD || '',
};
