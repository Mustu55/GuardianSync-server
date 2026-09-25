const Industry = require('../models/Industry');
const fs = require('fs');
const path = require('path');
const { parseSvgToIndustry } = require('../services/svgParser');

const fallbackIndustriesPath = path.join(__dirname, '..', '..', 'data', 'industries.json');

const loadFallbackIndustries = () => {
  if (!fs.existsSync(fallbackIndustriesPath)) return [];
  const raw = JSON.parse(fs.readFileSync(fallbackIndustriesPath, 'utf-8'));
  return raw.industries || raw;
};

// Load industry templates from JSON file or DB
const getIndustries = async (req, res, next) => {
  try {
    // Try DB first
    let industries = await Industry.find({ active: true }).lean();

    // If empty, load from mock-data file (initial seed)
    if (industries.length === 0) {
      industries = loadFallbackIndustries();
    }

    res.json(industries);
  } catch (err) { next(err); }
};

const getIndustryByName = async (req, res, next) => {
  try {
    let industry = await Industry.findOne({ name: req.params.name }).lean();
    if (!industry) {
      industry = loadFallbackIndustries().find((item) => item.name === req.params.name);
    }
    if (!industry) return res.status(404).json({ error: 'Industry not found' });
    res.json(industry);
  } catch (err) { next(err); }
};

const updateIndustryNode = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { nodeId, data } = req.body;
    const industry = await Industry.findOne({ name });
    if (!industry) return res.status(404).json({ error: 'Industry not found' });

    const node = industry.nodes.find((n) => n.id === nodeId);
    if (node) Object.assign(node.data, data);
    await industry.save();
    res.json(industry);
  } catch (err) { next(err); }
};

const uploadBlueprint = async (req, res, next) => {
  try {
    const { name, label, svgMarkup, description } = req.body;
    if (!name || !svgMarkup) {
      return res.status(400).json({ error: 'name and svgMarkup are required' });
    }

    const parsed = parseSvgToIndustry(svgMarkup);
    const payload = {
      name,
      label: label || name,
      description: description || 'Uploaded SVG blueprint',
      nodes: parsed.nodes,
      edges: parsed.edges,
      svgMarkup,
      svgMeta: parsed.meta,
      active: true,
    };

    const industry = await Industry.findOneAndUpdate(
      { name },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.json(industry);
  } catch (err) {
    next(err);
  }
};

module.exports = { getIndustries, getIndustryByName, updateIndustryNode, uploadBlueprint };
