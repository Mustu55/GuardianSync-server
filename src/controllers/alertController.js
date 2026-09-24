const Alert = require('../models/Alert');

const getAlerts = async (req, res, next) => {
  try {
    const { severity, acknowledged, limit = 50 } = req.query;
    const query = {};
    if (severity) query.severity = severity;
    if (acknowledged !== undefined) query.acknowledged = acknowledged === 'true';
    const alerts = await Alert.find(query).sort({ createdAt: -1 }).limit(parseInt(limit, 10)).lean();
    res.json(alerts);
  } catch (err) { next(err); }
};

const acknowledgeAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findByIdAndUpdate(req.params.id, {
      acknowledged: true,
      acknowledgedBy: req.user?.username || 'admin',
      acknowledgedAt: new Date(),
    }, { new: true });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (err) { next(err); }
};

const getAlertStats = async (req, res, next) => {
  try {
    const [total, critical, high, unacknowledged] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ severity: 'CRITICAL' }),
      Alert.countDocuments({ severity: 'HIGH' }),
      Alert.countDocuments({ acknowledged: false }),
    ]);
    res.json({ total, critical, high, unacknowledged });
  } catch {
    res.json({ total: 0, critical: 0, high: 0, unacknowledged: 0 });
  }
};

module.exports = { getAlerts, acknowledgeAlert, getAlertStats };
