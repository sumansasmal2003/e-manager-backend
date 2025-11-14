const EmailLog = require('../models/EmailLog');

// @desc    Get all email logs for the logged-in user
// @route   GET /api/notifications
exports.getEmailLogs = async (req, res) => {
  try {
    const logs = await EmailLog.find({ user: req.user.id })
      .sort({ createdAt: -1 }) // Newest first
      .limit(50); // Get the 50 most recent logs

    res.json(logs);
  } catch (error) {
    console.error('Get Email Logs Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
