const router = require('express').Router();
const { getAlerts, acknowledgeAlert, getAlertStats } = require('../controllers/alertController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', getAlerts);
router.get('/stats', getAlertStats);
router.put('/:id/acknowledge', acknowledgeAlert);

module.exports = router;
