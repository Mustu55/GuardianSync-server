const NORMAL_RANGES = {
  temperature: [20, 85],
  pressure: [50, 200],
  flow_rate: [30, 150],
  voltage: [210, 250],
  current: [5, 30],
  rpm: [800, 3600],
  vibration: [0.5, 5],
  humidity: [20, 70],
  power_consumption: [5, 50],
  response_time: [10, 100],
  packet_size: [64, 1024],
  command_frequency: [1, 20],
  error_rate: [0, 0.05],
  network_latency: [5, 50],
};

const HARD_LIMITS = {
  error_rate: 0.2,
  command_frequency: 40,
  network_latency: 200,
  packet_size: 2048,
};

const SUSPICIOUS_PATTERNS = [
  { regex: /full\s*speed|max(?:imum)?\s*speed/i, reason: 'full-speed request' },
  { regex: /run\s+the\s+generator|start\s+generator|generator\s+run/i, reason: 'generator run request' },
  { regex: /override|bypass|disable|force|emergency/i, reason: 'safety override intent' },
];

const parseDurationHours = (commandText) => {
  if (!commandText) return null;
  const match = commandText.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/i);
  if (!match) return null;
  const hours = Number(match[1]);
  return Number.isFinite(hours) ? hours : null;
};

const computeDeviation = (value, min, max) => {
  const mid = (min + max) / 2;
  const span = (max - min) / 2;
  if (!span) return 0;
  return Math.abs((value - mid) / span);
};

const evaluateCommandParameters = (parameters = {}, commandText = '') => {
  let outOfRange = 0;
  let maxDeviation = 0;
  const reasons = [];

  Object.entries(NORMAL_RANGES).forEach(([key, [min, max]]) => {
    const value = Number(parameters[key]);
    if (!Number.isFinite(value)) return;

    const deviation = computeDeviation(value, min, max);
    maxDeviation = Math.max(maxDeviation, deviation);

    if (value < min || value > max) {
      outOfRange += 1;
      reasons.push(`${key}=${value} outside ${min}-${max}`);
    }

    if (value > max * 1.8 || value < min * 0.2) {
      reasons.push(`${key} extreme deviation`);
    }
  });

  Object.entries(HARD_LIMITS).forEach(([key, limit]) => {
    const value = Number(parameters[key]);
    if (Number.isFinite(value) && value >= limit) {
      reasons.push(`${key} exceeds ${limit}`);
    }
  });

  const durationHours = parseDurationHours(commandText);
  if (durationHours != null && durationHours >= 4) {
    reasons.push(`duration ${durationHours}h exceeds safe window`);
  }

  SUSPICIOUS_PATTERNS.forEach(({ regex, reason }) => {
    if (commandText && regex.test(commandText)) {
      reasons.push(reason);
    }
  });

  const hardBlock = reasons.some((r) => r.includes('extreme') || r.includes('exceeds'));
  const textBlock = reasons.some((r) => r.includes('full-speed') || r.includes('duration') || r.includes('override') || r.includes('generator'));
  const shouldBlock = hardBlock || textBlock || maxDeviation >= 2.2;
  const shouldHold = !shouldBlock && (outOfRange >= 2 || maxDeviation >= 1.2 || reasons.length > 0);

  return {
    shouldBlock,
    shouldHold: !shouldBlock && shouldHold,
    outOfRange,
    maxDeviation,
    reasons,
  };
};

module.exports = { NORMAL_RANGES, evaluateCommandParameters };
