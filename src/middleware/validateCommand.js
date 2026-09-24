const { z } = require('zod');

const commandBodySchema = z.object({
  command: z.string().min(1).max(100),
  targetMachine: z.string().min(1).max(100),
  industry: z.string().min(1).max(50),
  parameters: z.object({
    temperature: z.number().optional(),
    pressure: z.number().optional(),
    flow_rate: z.number().optional(),
    voltage: z.number().optional(),
    current: z.number().optional(),
    rpm: z.number().optional(),
    vibration: z.number().optional(),
    humidity: z.number().optional(),
    power_consumption: z.number().optional(),
    response_time: z.number().optional(),
    packet_size: z.number().optional(),
    command_frequency: z.number().optional(),
    error_rate: z.number().optional(),
    network_latency: z.number().optional(),
  }).passthrough(),
});

const validateCommand = (req, res, next) => {
  try {
    req.body = commandBodySchema.parse(req.body);
    next();
  } catch (err) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors || err.message,
    });
  }
};

module.exports = { validateCommand, commandBodySchema };
