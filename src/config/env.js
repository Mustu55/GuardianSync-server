const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';

module.exports = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/guardiansync',
  JWT_SECRET: process.env.JWT_SECRET || 'guardiansync-dev-secret-key-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  AI_ENGINE_URL: process.env.AI_ENGINE_URL || 'http://localhost:8000',
  NODE_ENV,
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  SCADA_SIM_INTERVAL: parseInt(process.env.SCADA_SIM_INTERVAL || '3000', 10),
  SCADA_AUTO_START: String(
    process.env.SCADA_AUTO_START || (NODE_ENV === 'production' ? 'false' : 'true')
  ).toLowerCase() === 'true',
  SCADA_DEFAULT_INDUSTRY: process.env.SCADA_DEFAULT_INDUSTRY || 'power_plant',
};
