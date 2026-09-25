const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');

const isDatabaseConnected = () => mongoose.connection.readyState === 1;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    // In dev mode, continue without DB
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  Running without database — data will not persist');
      return null;
    }
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.isDatabaseConnected = isDatabaseConnected;
