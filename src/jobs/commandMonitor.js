const Command = require('../models/Command');
const { emitEvent } = require('../config/socket');
const { isDatabaseConnected } = require('../config/db');

let monitorInterval = null;

const startCommandMonitor = () => {
  monitorInterval = setInterval(async () => {
    try {
      if (!isDatabaseConnected()) return;

      // Auto-expire pending commands older than 5 minutes
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      const expired = await Command.updateMany(
        { status: 'pending', createdAt: { $lt: fiveMinAgo } },
        { status: 'blocked' }
      );
      if (expired.modifiedCount > 0) {
        emitEvent('commands:expired', { count: expired.modifiedCount });
      }
    } catch (err) {
      console.error('Command monitor error:', err.message);
    }
  }, 30000);
};

const stopCommandMonitor = () => {
  if (monitorInterval) clearInterval(monitorInterval);
};

module.exports = { startCommandMonitor, stopCommandMonitor };
