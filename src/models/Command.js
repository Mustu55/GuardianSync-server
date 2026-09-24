const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema({
  command: { type: String, required: true },
  targetMachine: { type: String, required: true },
  industry: { type: String, required: true },
  parameters: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'blocked', 'executed', 'rejected', 'killed'],
    default: 'pending',
  },
  holdReason: {
    type: String,
    enum: ['maintenance', 'anomaly', 'manual'],
    default: null,
  },
  queuedAt: { type: Date, default: null },
  aiResult: {
    action: String,
    anomalyScore: Number,
    confidence: Number,
    explanation: String,
    flaggedFeatures: [mongoose.Schema.Types.Mixed],
  },
  approvedBy: { type: String, default: null },
  executedAt: { type: Date, default: null },
  source: { type: String, default: 'manual' }, // manual | scada-sim | api
}, {
  timestamps: true,
});

commandSchema.index({ createdAt: -1 });
commandSchema.index({ status: 1 });
commandSchema.index({ industry: 1 });

module.exports = mongoose.model('Command', commandSchema);
