const Activity = require('../models/Activity');

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
    res.status(500).json({ message: 'Server Error' });
  }
};
