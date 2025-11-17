// routes/systemLogRoutes.js
const express = require('express');
const router = express.Router();
const {
  getSystemLogs,
  clearSystemLogs,
} = require('../controllers/systemLogController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

// @route   GET /api/system-logs
// @desc    Get all system logs for the user
router.route('/').get(getSystemLogs);

// @route   DELETE /api/system-logs/clear
// @desc    Delete all system logs for the user
router.route('/clear').delete(clearSystemLogs);

module.exports = router;
