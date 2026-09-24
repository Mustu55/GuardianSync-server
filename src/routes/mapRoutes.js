const router = require('express').Router();
const { getIndustries, getIndustryByName, updateIndustryNode, uploadBlueprint } = require('../controllers/mapController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', getIndustries);
router.get('/:name', getIndustryByName);
router.post('/upload', requireRole('admin'), uploadBlueprint);
router.put('/:name/node', updateIndustryNode);

module.exports = router;
