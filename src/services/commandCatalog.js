const COMMAND_LIBRARY = [
  { name: 'START_MACHINE', risk: 'safe', description: 'Start machine sequence' },
  { name: 'STOP_MACHINE', risk: 'safe', description: 'Stop machine sequence' },
  { name: 'OPEN_VALVE', risk: 'safe', description: 'Open valve' },
  { name: 'CLOSE_VALVE', risk: 'safe', description: 'Close valve' },
  { name: 'LOAD_INCREASE', risk: 'safe', description: 'Increase load' },
  { name: 'LOAD_DECREASE', risk: 'safe', description: 'Decrease load' },
  { name: 'READ_SENSOR', risk: 'safe', description: 'Read sensor data' },
  { name: 'CHECK_STATUS', risk: 'safe', description: 'Read machine status' },
  { name: 'DIAGNOSTICS', risk: 'safe', description: 'Run diagnostics' },
  { name: 'MAINTENANCE_MODE', risk: 'caution', description: 'Toggle maintenance mode' },
  { name: 'CALIBRATE_SENSOR', risk: 'caution', description: 'Calibrate sensor' },
  { name: 'RUN_DIAGNOSTICS', risk: 'caution', description: 'Deep diagnostics' },
  { name: 'LOCKOUT_TAGOUT', risk: 'caution', description: 'Lockout procedure' },
  { name: 'EMERGENCY_SHUTDOWN', risk: 'critical', description: 'Emergency shutdown' },
  { name: 'OVERRIDE_SAFETY', risk: 'critical', description: 'Override safety systems' },
  { name: 'DISABLE_ALARM', risk: 'critical', description: 'Disable alarms' },
  { name: 'FORCE_VALVE_OPEN', risk: 'critical', description: 'Force valve open' },
  { name: 'BYPASS_INTERLOCK', risk: 'critical', description: 'Bypass interlocks' },
  { name: 'SET_MAX_PRESSURE', risk: 'critical', description: 'Set maximum pressure' },
];

const COMMAND_RISK = COMMAND_LIBRARY.reduce((acc, item) => {
  acc[item.name] = item.risk;
  return acc;
}, {});

const getCommandRisk = (command) => {
  return COMMAND_RISK[command] || 'caution';
};

const isKnownCommand = (command) => Boolean(COMMAND_RISK[command]);

module.exports = { COMMAND_LIBRARY, getCommandRisk, isKnownCommand };
