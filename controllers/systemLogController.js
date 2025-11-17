// controllers/systemLogController.js
const SystemLog = require('../models/SystemLog');
const { logError } = require('../services/logService');

// @desc    Get all system logs for the logged-in user
// @route   GET /api/system-logs
exports.getSystemLogs = async (req, res) => {
  try {
    const logs = await SystemLog.find({ user: req.user.id })
      .sort({ createdAt: -1 }) // Newest first
      .limit(100); // Get the 100 most recent logs

    res.json(logs);
  } catch (error) {
    // Don't log this error to the DB, it would create a loop
    console.error('Get System Logs Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete all system logs for the logged-in user
// @route   DELETE /api/system-logs/clear
exports.clearSystemLogs = async (req, res) => {
  try {
    await SystemLog.deleteMany({ user: req.user.id });
    res.json({ message: 'System logs cleared successfully' });
  } catch (error) {
    // Don't log this error to the DB
    console.error('Clear System Logs Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};
