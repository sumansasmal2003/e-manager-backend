const express = require('express');
const router = express.Router();
const { getUsageStats, updateAllocation } = require('../controllers/aiUsageController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/stats')
  .get(getUsageStats);

router.route('/allocate')
  .put(authorize('owner'), updateAllocation); // Only Owner

module.exports = router;
