const Alert = require('../models/Alert');
const { emitEvent } = require('../config/socket');
const { isDatabaseConnected } = require('../config/db');

let dispatchInterval = null;

const startAlertDispatcher = () => {
  dispatchInterval = setInterval(async () => {
    try {
      if (!isDatabaseConnected()) return;

      const unack = await Alert.countDocuments({ acknowledged: false });
      const critical = await Alert.countDocuments({ severity: 'CRITICAL', acknowledged: false });
      emitEvent('alerts:summary', { unacknowledged: unack, critical });
    } catch (err) {
      console.error('Alert dispatcher error:', err.message);
    }
  }, 10000);
};

const stopAlertDispatcher = () => {
  if (dispatchInterval) clearInterval(dispatchInterval);
};

module.exports = { startAlertDispatcher, stopAlertDispatcher };
