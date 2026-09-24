const Command = require('../models/Command');
const Alert = require('../models/Alert');

const logCommand = async (data) => {
  try {
    if (!data || !data.command) {
      throw new Error('Invalid command data');
    }
    const cmd = new Command(data);
    await cmd.save();
    return cmd;
  } catch (err) {
    console.error('Log command error:', err.message, { data });
    throw err;
  }
};

const logAlert = async (data) => {
  try {
    if (!data || !data.type) {
      throw new Error('Invalid alert data');
    }
    const alert = new Alert(data);
    await alert.save();
    return alert;
  } catch (err) {
    console.error('Log alert error:', err.message, { data });
    throw err;
  }
};

const getForensicLogs = async (filters = {}) => {
  const query = {};
  if (filters.industry) query.industry = filters.industry;
  if (filters.status) query.status = filters.status;
  if (filters.from || filters.to) {
    query.createdAt = {};
    if (filters.from) query.createdAt.$gte = new Date(filters.from);
    if (filters.to) query.createdAt.$lte = new Date(filters.to);
  }

  const page = parseInt(filters.page || '1', 10);
  const limit = parseInt(filters.limit || '50', 10);

  const [commands, total] = await Promise.all([
    Command.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Command.countDocuments(query),
  ]);

  return { commands, total, page, limit, pages: Math.ceil(total / limit) };
};

const getStats = async () => {
  try {
    const [total, blocked, approved, pending] = await Promise.all([
      Command.countDocuments(),
      Command.countDocuments({ status: 'blocked' }),
      Command.countDocuments({ status: 'approved' }),
      Command.countDocuments({ status: 'pending' }),
    ]);
    const recentAlerts = await Alert.find().sort({ createdAt: -1 }).limit(10).lean();
    return { total, blocked, approved, pending, recentAlerts };
  } catch {
    return { total: 0, blocked: 0, approved: 0, pending: 0, recentAlerts: [] };
  }
};

module.exports = { logCommand, logAlert, getForensicLogs, getStats };
