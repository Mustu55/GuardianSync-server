const { getForensicLogs, getStats } = require('../services/logService');
const Command = require('../models/Command');

const getLogs = async (req, res, next) => {
  try {
    const result = await getForensicLogs(req.query);
    res.json(result);
  } catch (err) { next(err); }
};

const getLog = async (req, res, next) => {
  try {
    const cmd = await Command.findById(req.params.id).lean();
    if (!cmd) return res.status(404).json({ error: 'Log not found' });
    res.json(cmd);
  } catch (err) { next(err); }
};

const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) { next(err); }
};

const exportLogs = async (req, res, next) => {
  try {
    const result = await getForensicLogs({ ...req.query, limit: '1000' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=guardiansync-forensic-${Date.now()}.json`);
    res.json(result.commands);
  } catch (err) { next(err); }
};

module.exports = { getLogs, getLog, getDashboardStats, exportLogs };
