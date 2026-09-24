const router = require('express').Router();
const { getLogs, getLog, getDashboardStats, exportLogs } = require('../controllers/forensicController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', getLogs);
router.get('/stats', getDashboardStats);
router.get('/export', exportLogs);
router.get('/:id', getLog);

module.exports = router;
