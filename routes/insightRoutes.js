// routes/insightRoutes.js
const express = require('express');
const router = express.Router();
const {
  getInsights,
  markInsightAsRead,
} = require('../controllers/insightController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// @route   GET /api/insights
// @desc    Get all unread insights, generating new ones if stale
router.route('/').get(getInsights);

// @route   PUT /api/insights/:id/read
// @desc    Mark a single insight as read
router.route('/:id/read').put(markInsightAsRead);

module.exports = router;
