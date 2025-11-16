// routes/aiUsageRoutes.js
const express = require('express');
const router = express.Router();
const { getUsageStats } = require('../controllers/aiUsageController');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/ai-usage/stats
// @desc    Get all AI usage statistics for the logged-in user
// @access  Private
router.route('/stats').get(protect, getUsageStats);

module.exports = router;
