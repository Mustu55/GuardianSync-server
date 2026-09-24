const { predictCommand } = require('../services/aiClient');
const { logCommand, logAlert } = require('../services/logService');
const { emitEvent } = require('../config/socket');
const { getCommandRisk, isKnownCommand } = require('../services/commandCatalog');
const { evaluateCommandParameters } = require('../services/commandRules');
const {
  getStatus,
  setKillSwitch,
  setIndustry,
  startSimulation,
  stopSimulation,
  setMaintenance,
  setSimulationMode,
} = require('../services/packetBroker');
const Command = require('../models/Command');

const buildAlertSummary = ({ cmdStatus, holdReason, ruleCheck, score, risk, aiResult }) => {
  const details = [];

  if (holdReason === 'maintenance') {
    details.push('Maintenance window active; manual approval required.');
  }

  if (ruleCheck.reasons.length) {
    details.push(`Rule flags: ${ruleCheck.reasons.slice(0, 3).join('; ')}.`);
  }

  if (score >= 0.6) {
    const thresholdNote = score >= 0.8 ? 'exceeds' : 'is above';
    details.push(`Anomaly score ${(score * 100).toFixed(1)}% ${thresholdNote} threshold for ${risk} command.`);
  }

  if (aiResult?.explanation) {
    details.push(`AI: ${aiResult.explanation}`);
  }

  const statusPrefix = cmdStatus === 'blocked' ? 'Blocked.' : 'Sent for approval.';
  return `${statusPrefix} ${details.join(' ')}`.trim();
};

const submitCommand = async (req, res, next) => {
  try {
    const { command, targetMachine, industry, parameters } = req.body;
    const status = getStatus();

    if (status.killSwitchActive) {
      return res.status(403).json({
        error: 'Kill switch is active. All commands are blocked.',
        status: 'killed',
      });
    }

    // Get AI prediction
    const aiResult = await predictCommand({ command, targetMachine, industry, parameters });

    const risk = getCommandRisk(command);
    const score = aiResult.anomaly_score || 0;
    const ruleCheck = evaluateCommandParameters(parameters, command);
    const knownCommand = isKnownCommand(command);
    const normalizedAiResult = {
      ...aiResult,
      action: aiResult.action || 'PASS',
      explanation: aiResult.explanation || 'AI assessment completed.',
      anomaly_score: score,
      confidence: aiResult.confidence ?? 0.5,
      flagged_features: aiResult.flagged_features || [],
    };

    let cmdStatus = 'approved';
    let holdReason = null;

    if (status.maintenanceActive) {
      cmdStatus = 'pending';
      holdReason = 'maintenance';
    } else if (req.user?.role !== 'admin') {
      if (!knownCommand) {
        cmdStatus = 'blocked';
        holdReason = 'anomaly';
        ruleCheck.reasons.push('unknown command');
      } else if (ruleCheck.shouldBlock) {
        cmdStatus = 'blocked';
        holdReason = 'anomaly';
      } else if (ruleCheck.shouldHold) {
        cmdStatus = 'pending';
        holdReason = 'anomaly';
      } else if (score >= 0.8 && risk === 'critical') {
        cmdStatus = 'blocked';
        holdReason = 'anomaly';
      } else if (score >= 0.6) {
        cmdStatus = 'pending';
        holdReason = 'anomaly';
      }
    }

    if (!knownCommand || ruleCheck.shouldBlock) {
      normalizedAiResult.action = 'BLOCK';
      normalizedAiResult.anomaly_score = Math.max(normalizedAiResult.anomaly_score || 0, 0.95);
      normalizedAiResult.confidence = Math.max(normalizedAiResult.confidence || 0, 0.9);
      normalizedAiResult.explanation = `Rule-based block: ${ruleCheck.reasons.slice(0, 3).join('; ')}.${normalizedAiResult.explanation ? ` ${normalizedAiResult.explanation}` : ''}`.trim();
    } else if (ruleCheck.shouldHold) {
      normalizedAiResult.anomaly_score = Math.max(normalizedAiResult.anomaly_score || 0, 0.7);
      normalizedAiResult.confidence = Math.max(normalizedAiResult.confidence || 0, 0.7);
      normalizedAiResult.explanation = `Rule-based hold: ${ruleCheck.reasons.slice(0, 3).join('; ')}.${normalizedAiResult.explanation ? ` ${normalizedAiResult.explanation}` : ''}`.trim();
    }

    // Log to DB
    const saved = await logCommand({
      command, targetMachine, industry, parameters,
      status: cmdStatus,
      holdReason,
      queuedAt: cmdStatus === 'pending' ? new Date() : null,
      aiResult: {
        action: normalizedAiResult.action,
        anomalyScore: normalizedAiResult.anomaly_score,
        confidence: normalizedAiResult.confidence,
        explanation: ruleCheck.reasons.length
          ? `${normalizedAiResult.explanation} Rule flags: ${ruleCheck.reasons.slice(0, 3).join('; ')}.`
          : normalizedAiResult.explanation,
        flaggedFeatures: normalizedAiResult.flagged_features || [],
      },
      source: req.body.source || 'manual',
    });

    // Emit real-time update
    emitEvent('command:result', {
      id: saved?._id || Date.now().toString(),
      command, targetMachine, industry, status: cmdStatus, holdReason,
      aiResult: {
        action: normalizedAiResult.action,
        anomalyScore: normalizedAiResult.anomaly_score,
        confidence: normalizedAiResult.confidence,
        explanation: ruleCheck.reasons.length
          ? `${normalizedAiResult.explanation} Rule flags: ${ruleCheck.reasons.slice(0, 3).join('; ')}.`
          : normalizedAiResult.explanation,
        flaggedFeatures: normalizedAiResult.flagged_features || [],
      },
      timestamp: new Date().toISOString(),
    });

    // If blocked or pending, generate alert with rationale
    if (cmdStatus === 'blocked' || cmdStatus === 'pending') {
      const severity = cmdStatus === 'blocked'
        ? (score > 0.8 ? 'CRITICAL' : 'HIGH')
        : (score >= 0.7 ? 'HIGH' : 'MEDIUM');
      const message = buildAlertSummary({ cmdStatus, holdReason, ruleCheck, score, risk, aiResult });
      const alertData = {
        type: 'anomaly',
        severity,
        title: cmdStatus === 'blocked'
          ? `Command Blocked: ${command}`
          : `Approval Required: ${command}`,
        message,
        commandId: saved?._id,
        industry, targetMachine,
        anomalyScore: score,
        metadata: {
          status: cmdStatus,
          holdReason,
          risk,
          reasonSummary: message,
          ruleFlags: ruleCheck.reasons.slice(0, 5),
          aiExplanation: aiResult.explanation,
          confidence: aiResult.confidence,
        },
      };
      await logAlert(alertData);
      emitEvent('alert:new', { ...alertData, timestamp: new Date().toISOString() });
    }

    if (req.user?.role === 'admin') {
      const isDangerous = risk === 'critical' || ruleCheck.shouldHold || ruleCheck.shouldBlock || score >= 0.6;
      if (isDangerous) {
        const severity = ruleCheck.shouldBlock || score >= 0.8 || risk === 'critical' ? 'CRITICAL' : 'HIGH';
        const message = `Admin executed ${command} with elevated risk. `
          + `Risk level: ${risk}. `
          + (ruleCheck.reasons.length ? `Rule flags: ${ruleCheck.reasons.slice(0, 3).join('; ')}. ` : '')
          + (aiResult?.explanation ? `AI: ${aiResult.explanation}` : '');
        const adminAlert = {
          type: 'admin_action',
          severity,
          title: `Admin Override: ${command}`,
          message: message.trim(),
          commandId: saved?._id,
          industry,
          targetMachine,
          anomalyScore: score,
          metadata: {
            status: cmdStatus,
            risk,
            ruleFlags: ruleCheck.reasons.slice(0, 5),
            aiExplanation: aiResult.explanation,
            confidence: aiResult.confidence,
          },
        };
        await logAlert(adminAlert);
        emitEvent('alert:new', { ...adminAlert, timestamp: new Date().toISOString() });
      }
    }

    res.status(200).json({
      id: saved?._id,
      status: cmdStatus,
      aiResult: {
        action: normalizedAiResult.action,
        anomalyScore: normalizedAiResult.anomaly_score,
        confidence: normalizedAiResult.confidence,
        explanation: normalizedAiResult.explanation,
        flaggedFeatures: normalizedAiResult.flagged_features || [],
      },
    });
  } catch (err) {
    next(err);
  }
};

const approveCommand = async (req, res, next) => {
  try {
    const cmd = await Command.findById(req.params.id);
    if (!cmd) return res.status(404).json({ error: 'Command not found' });

    const status = getStatus();
    const needsMaintenanceRecheck = cmd.holdReason === 'maintenance' || status.maintenanceActive;
    if (needsMaintenanceRecheck) {
      const aiResult = await predictCommand({
        command: cmd.command,
        targetMachine: cmd.targetMachine,
        industry: cmd.industry,
        parameters: cmd.parameters,
      });
      const risk = getCommandRisk(cmd.command);
      const score = aiResult.anomaly_score || 0;
      const ruleCheck = evaluateCommandParameters(cmd.parameters || {}, cmd.command);
      const knownCommand = isKnownCommand(cmd.command);

      const normalizedAiResult = {
        ...aiResult,
        action: aiResult.action || 'PASS',
        explanation: aiResult.explanation || 'AI assessment completed.',
        anomaly_score: score,
        confidence: aiResult.confidence ?? 0.5,
        flagged_features: aiResult.flagged_features || [],
      };

      if (!knownCommand || ruleCheck.shouldBlock) {
        normalizedAiResult.action = 'BLOCK';
        normalizedAiResult.anomaly_score = Math.max(normalizedAiResult.anomaly_score || 0, 0.95);
        normalizedAiResult.confidence = Math.max(normalizedAiResult.confidence || 0, 0.9);
        normalizedAiResult.explanation = `Rule-based block: ${ruleCheck.reasons.slice(0, 3).join('; ')}.${normalizedAiResult.explanation ? ` ${normalizedAiResult.explanation}` : ''}`.trim();
      } else if (ruleCheck.shouldHold) {
        normalizedAiResult.anomaly_score = Math.max(normalizedAiResult.anomaly_score || 0, 0.7);
        normalizedAiResult.confidence = Math.max(normalizedAiResult.confidence || 0, 0.7);
        normalizedAiResult.explanation = `Rule-based hold: ${ruleCheck.reasons.slice(0, 3).join('; ')}.${normalizedAiResult.explanation ? ` ${normalizedAiResult.explanation}` : ''}`.trim();
      }

      const isAnomalous = !knownCommand
        || ruleCheck.shouldBlock
        || ruleCheck.shouldHold
        || (score >= 0.8 && risk === 'critical')
        || score >= 0.6;

      if (isAnomalous && normalizedAiResult.action !== 'BLOCK') {
        normalizedAiResult.action = 'BLOCK';
      }

      if (isAnomalous) {
        cmd.status = 'blocked';
        cmd.holdReason = 'anomaly';
        cmd.queuedAt = null;
        cmd.executedAt = new Date();
        cmd.approvedBy = req.user?.username || 'admin';
        cmd.aiResult = {
          action: normalizedAiResult.action,
          anomalyScore: normalizedAiResult.anomaly_score,
          confidence: normalizedAiResult.confidence,
          explanation: ruleCheck.reasons.length
            ? `${normalizedAiResult.explanation} Rule flags: ${ruleCheck.reasons.slice(0, 3).join('; ')}.`
            : normalizedAiResult.explanation,
          flaggedFeatures: normalizedAiResult.flagged_features || [],
        };
        await cmd.save();

        const message = buildAlertSummary({
          cmdStatus: 'blocked',
          holdReason: 'anomaly',
          ruleCheck,
          score,
          risk,
          aiResult,
        });
        const alertData = {
          type: 'anomaly',
          severity: score > 0.8 ? 'CRITICAL' : 'HIGH',
          title: `Command Blocked: ${cmd.command}`,
          message,
          commandId: cmd._id,
          industry: cmd.industry,
          targetMachine: cmd.targetMachine,
          anomalyScore: score,
          metadata: {
            status: 'blocked',
            holdReason: 'anomaly',
            risk,
            ruleFlags: ruleCheck.reasons.slice(0, 5),
            aiExplanation: aiResult.explanation,
            confidence: aiResult.confidence,
          },
        };
        await logAlert(alertData);
        emitEvent('alert:new', { ...alertData, timestamp: new Date().toISOString() });

        emitEvent('command:result', {
          id: cmd._id,
          command: cmd.command,
          targetMachine: cmd.targetMachine,
          industry: cmd.industry,
          status: 'blocked',
          holdReason: 'anomaly',
          aiResult: cmd.aiResult,
          timestamp: new Date().toISOString(),
        });

        return res.json(cmd);
      }

      cmd.aiResult = {
        action: normalizedAiResult.action,
        anomalyScore: normalizedAiResult.anomaly_score,
        confidence: normalizedAiResult.confidence,
        explanation: ruleCheck.reasons.length
          ? `${normalizedAiResult.explanation} Rule flags: ${ruleCheck.reasons.slice(0, 3).join('; ')}.`
          : normalizedAiResult.explanation,
        flaggedFeatures: normalizedAiResult.flagged_features || [],
      };
    }

    cmd.status = 'approved';
    cmd.approvedBy = req.user?.username || 'admin';
    cmd.executedAt = new Date();
    cmd.holdReason = null;
    cmd.queuedAt = null;
    await cmd.save();
    if (cmd.command === 'KILL_SWITCH_OFF') {
      setKillSwitch(false);
    }
    // Emit approval and a command result so live feed/console update
    emitEvent('command:approved', { id: cmd._id, command: cmd.command, targetMachine: cmd.targetMachine });

    const resultPayload = {
      id: cmd._id,
      command: cmd.command,
      targetMachine: cmd.targetMachine,
      industry: cmd.industry,
      status: 'approved',
      holdReason: null,
      aiResult: cmd.aiResult || null,
      timestamp: new Date().toISOString(),
    };
    emitEvent('command:result', resultPayload);

    res.json(cmd);
  } catch (err) { next(err); }
};

const rejectCommand = async (req, res, next) => {
  try {
    // Mark rejected approvals as blocked so the UI treats them as blocked
    const cmd = await Command.findByIdAndUpdate(req.params.id, {
      status: 'blocked',
      holdReason: null,
      queuedAt: null,
    }, { new: true });
    if (!cmd) return res.status(404).json({ error: 'Command not found' });
    // Emit rejection and a command result so live feed/console update as blocked
    emitEvent('command:rejected', { id: cmd._id });

    const resultPayload = {
      id: cmd._id,
      command: cmd.command,
      targetMachine: cmd.targetMachine,
      industry: cmd.industry,
      status: 'blocked',
      holdReason: null,
      aiResult: cmd.aiResult || null,
      timestamp: new Date().toISOString(),
    };
    emitEvent('command:result', resultPayload);

    res.json(cmd);
  } catch (err) { next(err); }
};

const getPendingCommands = async (req, res, next) => {
  try {
    const cmds = await Command.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(cmds);
  } catch (err) { next(err); }
};

const getRecentCommands = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const cmds = await Command.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json(cmds);
  } catch (err) { next(err); }
};

const toggleKillSwitch = async (req, res) => {
  const { active } = req.body;
  const isAdmin = req.user?.role === 'admin' || req.user?.username === 'admin';
  const desiredActive = !!active;
  const status = getStatus();
  const isDisabling = status.killSwitchActive && !desiredActive;
  
  // If operator is trying to disable kill switch, require approval
  if (isDisabling && !isAdmin) {
    const request = await logCommand({
      command: 'KILL_SWITCH_OFF',
      targetMachine: 'kill-switch',
      industry: status.currentIndustry || 'power_plant',
      parameters: { requestedBy: req.user?.username || 'operator' },
      status: 'pending',
      holdReason: 'manual',
      queuedAt: new Date(),
      aiResult: {
        action: 'PENDING',
        anomalyScore: 0,
        confidence: 1,
        explanation: 'Manual approval required to disable kill switch.',
        flaggedFeatures: [],
      },
      source: 'manual',
    });

    const alertData = {
      type: 'kill_switch',
      severity: 'HIGH',
      title: 'Approval Required: Kill Switch Disable',
      message: `Operator ${req.user?.username || 'operator'} requested kill switch disable.`,
      commandId: request?._id,
      industry: status.currentIndustry || 'power_plant',
      targetMachine: 'kill-switch',
      timestamp: new Date().toISOString(),
      metadata: {
        status: 'pending',
        holdReason: 'manual',
        requestedBy: req.user?.username || 'operator',
      },
    };
    await logAlert(alertData);
    emitEvent('alert:new', alertData);
    emitEvent('approval:new', { type: 'kill_switch', requestCount: 1 });

    return res.status(202).json({
      killSwitchActive: status.killSwitchActive,
      pendingApproval: true,
      requestId: request?._id,
    });
  }
  
  // Admin can always disable kill switch directly
  // All users can enable kill switch
  if (isDisabling && isAdmin) {
    emitEvent('killswitch:admin-override', { 
      admin: req.user?.username || 'admin',
      action: 'disabled',
    });
  }
  
  setKillSwitch(desiredActive);
  res.json({ killSwitchActive: desiredActive });
};

const controlSimulation = async (req, res) => {
  const { action, industry, mode } = req.body;
  if (action === 'start') {
    startSimulation(industry || 'power_plant');
  } else if (action === 'stop') {
    stopSimulation();
  } else if (action === 'switch') {
    setIndustry(industry);
  }
  if (mode) {
    setSimulationMode(mode);
  }
  res.json(getStatus());
};

const getSimStatus = (req, res) => {
  res.json(getStatus());
};

const toggleMaintenance = async (req, res) => {
  const { active, windowMinutes } = req.body;
  setMaintenance(!!active, windowMinutes);
  res.json(getStatus());
};

module.exports = {
  submitCommand, approveCommand, rejectCommand,
  getPendingCommands, getRecentCommands,
  toggleKillSwitch, controlSimulation, getSimStatus,
  toggleMaintenance,
};
