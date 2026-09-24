const mongoose = require('mongoose');

const industrySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  label: { type: String, required: true },
  description: { type: String },
  nodes: [{
    id: String,
    type: { type: String, default: 'machineNode' },
    position: { x: Number, y: Number },
    data: {
      label: String,
      machineId: String,
      status: { type: String, default: 'online' },
      sensors: mongoose.Schema.Types.Mixed,
    },
  }],
  edges: [{
    id: String,
    source: String,
    target: String,
    animated: { type: Boolean, default: true },
    label: String,
    style: mongoose.Schema.Types.Mixed,
  }],
  svgMarkup: { type: String, default: null },
  svgMeta: {
    layers: [String],
    nodesExtracted: { type: Number, default: 0 },
    edgesExtracted: { type: Number, default: 0 },
  },
  active: { type: Boolean, default: true },
  killSwitchActive: { type: Boolean, default: false },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Industry', industrySchema);
