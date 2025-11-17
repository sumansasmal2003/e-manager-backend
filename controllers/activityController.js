const Activity = require('../models/Activity');
const { logError } = require('../services/logService');

// @desc    Get all activity for a team
// @route   GET /api/activity/:teamId
exports.getActivityForTeam = async (req, res) => {
  try {
    const activities = await Activity.find({ team: req.params.teamId })
      .sort({ createdAt: -1 }) // Newest first
      .limit(30) // Get the 30 most recent activities
      .populate('user', 'username'); // Show who performed the action

    res.json(activities);
  } catch (error) {
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get ALL activity for a team
// @route   GET /api/activity/:teamId/all
exports.getAllActivityForTeam = async (req, res) => {
  try {
    const activities = await Activity.find({ team: req.params.teamId })
      .sort({ createdAt: -1 }) // Newest first
      // No .limit() - get all
      .populate('user', 'username'); // Show who performed the action

    res.json(activities);
  } catch (error) {
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};
