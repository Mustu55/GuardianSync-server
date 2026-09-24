const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['anomaly', 'intrusion', 'system', 'threshold', 'kill_switch', 'admin_action'],
    required: true,
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  commandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Command', default: null },
  industry: { type: String, required: true },
  targetMachine: { type: String, default: null },
  anomalyScore: { type: Number, default: 0 },
  acknowledged: { type: Boolean, default: false },
  acknowledgedBy: { type: String, default: null },
  acknowledgedAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

alertSchema.index({ createdAt: -1 });
alertSchema.index({ severity: 1, acknowledged: 1 });

module.exports = mongoose.model('Alert', alertSchema);
