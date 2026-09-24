const axios = require('axios');
const { AI_ENGINE_URL } = require('../config/env');

const aiClient = axios.create({
  baseURL: AI_ENGINE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

const MAX_RETRIES = 2;
const RETRY_DELAY = 500; // ms

const predictCommand = async (commandData, retries = 0) => {
  try {
    if (!commandData || !commandData.command) {
      throw new Error('Invalid command data');
    }
    const payload = {
      command: commandData.command,
      target_machine: commandData.targetMachine,
      industry: commandData.industry,
      parameters: commandData.parameters,
    };
    const { data } = await aiClient.post('/predict', payload);
    return data;
  } catch (error) {
    if (retries < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
      return predictCommand(commandData, retries + 1);
    }
    console.error('⚠️  AI Engine unavailable after retries:', error.message);
    return {
      action: 'PASS',
      anomaly_score: 0.0,
      confidence: 0.5,
      explanation: 'AI Engine unavailable — command passed by default. Manual review recommended.',
      flagged_features: [],
      timestamp: new Date().toISOString(),
      command: commandData.command,
      target_machine: commandData.targetMachine,
    };
  }
};

const trainModel = async () => {
  const { data } = await aiClient.post('/train');
  return data;
};

const getHealth = async () => {
  const { data } = await aiClient.get('/health');
  return data;
};

module.exports = { predictCommand, trainModel, getHealth };
