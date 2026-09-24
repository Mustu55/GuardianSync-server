const router = require('express').Router();
const {
  submitCommand, approveCommand, rejectCommand,
  getPendingCommands, getRecentCommands,
  toggleKillSwitch, controlSimulation, getSimStatus, toggleMaintenance,
} = require('../controllers/commandController');
const { validateCommand } = require('../middleware/validateCommand');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/', validateCommand, submitCommand);
router.get('/recent', getRecentCommands);
router.get('/pending', getPendingCommands);
router.put('/:id/approve', requireRole('admin'), approveCommand);
router.put('/:id/reject', requireRole('admin'), rejectCommand);
router.post('/killswitch', toggleKillSwitch);
router.post('/maintenance', requireRole('admin'), toggleMaintenance);
router.post('/simulation', requireRole('admin'), controlSimulation);
router.get('/simulation/status', getSimStatus);

module.exports = router;
