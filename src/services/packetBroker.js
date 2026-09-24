const { emitEvent } = require('../config/socket');
const { predictCommand } = require('./aiClient');
const { SCADA_SIM_INTERVAL } = require('../config/env');

// In-memory SCADA state
let simulationActive = false;
let simulationInterval = null;
let currentIndustry = 'power_plant';
let killSwitchActive = false;
let maintenanceActive = false;
let maintenanceWindow = null;
let simulationMode = 'normal';
let packetCounter = 0;

const NORMAL_RANGES = {
  temperature: [20, 85], pressure: [50, 200], flow_rate: [30, 150],
  voltage: [210, 250], current: [5, 30], rpm: [800, 3600],
  vibration: [0.5, 5], humidity: [20, 70], power_consumption: [5, 50],
  response_time: [10, 100], packet_size: [64, 1024], command_frequency: [1, 20],
  error_rate: [0, 0.05], network_latency: [5, 50],
};

const INDUSTRY_MACHINES = {
  power_plant: ['turbine-01', 'generator-01', 'transformer-01', 'cooling-tower-01', 'boiler-01'],
  water_treatment: ['intake-pump-01', 'filter-unit-01', 'chlorinator-01', 'storage-tank-01', 'dist-pump-01'],
  manufacturing: ['conveyor-01', 'robot-arm-01', 'press-01', 'qc-scanner-01', 'packaging-01'],
  chemical_facility: ['reactor-01', 'distiller-01', 'mixer-01', 'storage-vessel-01', 'scrubber-01'],
};

const SAFE_COMMANDS = ['CHECK_STATUS', 'READ_SENSOR', 'SYNC_TIME', 'DIAGNOSTICS', 'HEARTBEAT'];
const ATTACK_COMMANDS = ['OVERRIDE_SAFETY', 'DISABLE_ALARM', 'FORCE_VALVE_OPEN', 'BYPASS_INTERLOCK', 'SET_MAX_PRESSURE'];
const MAINTENANCE_COMMANDS = ['MAINTENANCE_CHECK', 'CALIBRATE_SENSOR', 'RUN_DIAGNOSTICS', 'LOCKOUT_TAGOUT'];

function rand(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function generateNormalPacket() {
  const machines = INDUSTRY_MACHINES[currentIndustry] || INDUSTRY_MACHINES.power_plant;
  const params = {};
  for (const [key, [lo, hi]] of Object.entries(NORMAL_RANGES)) {
    const mid = (lo + hi) / 2;
    const spread = (hi - lo) / 4;
    params[key] = rand(mid - spread, mid + spread);
  }
  return {
    command: SAFE_COMMANDS[Math.floor(Math.random() * SAFE_COMMANDS.length)],
    targetMachine: machines[Math.floor(Math.random() * machines.length)],
    industry: currentIndustry,
    parameters: params,
    source: 'scada-sim',
    timestamp: new Date().toISOString(),
    packetId: `PKT-${++packetCounter}`,
  };
}

function generateAttackPacket() {
  const packet = generateNormalPacket();
  packet.command = ATTACK_COMMANDS[Math.floor(Math.random() * ATTACK_COMMANDS.length)];
  // Corrupt 3-5 sensor values
  const keys = Object.keys(NORMAL_RANGES);
  const targets = keys.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 3);
  for (const key of targets) {
    const [lo, hi] = NORMAL_RANGES[key];
    packet.parameters[key] = rand(hi * 2, hi * 5);
  }
  packet.parameters.error_rate = rand(0.3, 0.95);
  packet.parameters.command_frequency = rand(50, 200);
  packet._isAttack = true;
  return packet;
}

function generateMaintenancePacket() {
  const packet = generateNormalPacket();
  packet.command = MAINTENANCE_COMMANDS[Math.floor(Math.random() * MAINTENANCE_COMMANDS.length)];
  packet._maintenance = true;
  return packet;
}

function startSimulation(industry = 'power_plant') {
  if (simulationActive) return;
  currentIndustry = industry;
  simulationActive = true;
  packetCounter = 0;

  simulationInterval = setInterval(async () => {
    if (killSwitchActive) return;

    if (maintenanceWindow?.endsAt && Date.now() > maintenanceWindow.endsAt) {
      maintenanceWindow = null;
      maintenanceActive = false;
      emitEvent('maintenance:changed', { active: false });
    }

    let packet = null;
    if (simulationMode === 'maintenance' || maintenanceActive) {
      packet = generateMaintenancePacket();
    } else if (simulationMode === 'attack') {
      packet = generateAttackPacket();
    } else {
      // Keep automatic mode visibly mixed while guaranteeing regular anomaly traffic.
      const isAttack = packetCounter % 5 === 0 || Math.random() < 0.15;
      packet = isAttack ? generateAttackPacket() : generateNormalPacket();
    }

    emitEvent('packet:new', packet);

    // Run AI prediction on the packet
    try {
      const aiResult = await predictCommand(packet);
      const enrichedPacket = {
        ...packet,
        aiResult: {
          action: aiResult.action,
          anomalyScore: aiResult.anomaly_score,
          confidence: aiResult.confidence,
          explanation: aiResult.explanation,
        },
      };

      emitEvent('packet:analyzed', enrichedPacket);

      if (aiResult.action === 'BLOCK') {
        emitEvent('alert:new', {
          type: 'anomaly',
          severity: aiResult.anomaly_score > 0.8 ? 'CRITICAL' : 'HIGH',
          title: `Blocked: ${packet.command}`,
          message: aiResult.explanation,
          targetMachine: packet.targetMachine,
          industry: packet.industry,
          anomalyScore: aiResult.anomaly_score,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      // AI offline — still emit the raw packet
    }
  }, SCADA_SIM_INTERVAL);

  console.log(`🏭 SCADA simulation started for: ${industry}`);
}

function stopSimulation() {
  if (simulationInterval) clearInterval(simulationInterval);
  simulationActive = false;
  console.log('🛑 SCADA simulation stopped');
}

function setKillSwitch(active) {
  killSwitchActive = active;
  emitEvent('killswitch:changed', { active });
  if (active) {
    emitEvent('alert:new', {
      type: 'kill_switch',
      severity: 'CRITICAL',
      title: 'KILL SWITCH ACTIVATED',
      message: 'All SCADA operations halted. Manual reset required.',
      industry: currentIndustry,
      timestamp: new Date().toISOString(),
    });
  }
}

function setMaintenance(active, windowMinutes = null) {
  maintenanceActive = !!active;
  if (maintenanceActive && windowMinutes) {
    maintenanceWindow = { startsAt: Date.now(), endsAt: Date.now() + windowMinutes * 60 * 1000 };
  } else if (!maintenanceActive) {
    maintenanceWindow = null;
  }
  emitEvent('maintenance:changed', { active: maintenanceActive, window: maintenanceWindow });
}

function setSimulationMode(mode) {
  simulationMode = mode || 'normal';
}

function setIndustry(industry) {
  currentIndustry = industry;
  emitEvent('industry:changed', { industry });
}

function getStatus() {
  return {
    simulationActive,
    currentIndustry,
    killSwitchActive,
    packetCounter,
    maintenanceActive,
    maintenanceWindow,
    simulationMode,
  };
}

module.exports = {
  startSimulation, stopSimulation, setKillSwitch,
  setIndustry, getStatus, generateNormalPacket, generateAttackPacket,
  generateMaintenancePacket, setMaintenance, setSimulationMode,
};
