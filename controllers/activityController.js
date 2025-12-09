const Activity = require('../models/Activity');
const User = require('../models/User'); // <-- Import User
const { logError } = require('../services/logService');

// Helper to calculate date limit based on plan
const getDateLimit = (plan) => {
  const now = new Date();
  if (plan === 'free') {
    now.setDate(now.getDate() - 7); // 7 Days
    return now;
  } else if (plan === 'professional') {
    now.setDate(now.getDate() - 30); // 30 Days
    return now;
  } else {
    return new Date(0); // Unlimited (Premium) - Return Epoch
  }
};

// @desc    Get all activity for a team
// @route   GET /api/activity/:teamId
exports.getActivityForTeam = async (req, res) => {
  try {
    // req.team is populated by the checkTeamMembership middleware
    const teamOwnerId = req.team.owner;

    // Fetch the owner to check their subscription plan
    const owner = await User.findById(teamOwnerId).select('subscription');

    // If for some reason owner is missing (deleted?), default to free
    const plan = owner?.subscription?.plan || 'free';
    const dateLimit = getDateLimit(plan);

    const activities = await Activity.find({
      team: req.params.teamId,
      createdAt: { $gte: dateLimit } // <-- FILTER APPLIED
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('user', 'username');

    res.json(activities);
  } catch (error) {
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get ALL activity for a team (Expanded View)
// @route   GET /api/activity/:teamId/all
exports.getAllActivityForTeam = async (req, res) => {
  try {
    const teamOwnerId = req.team.owner;
    const owner = await User.findById(teamOwnerId).select('subscription');
    const plan = owner?.subscription?.plan || 'free';
    const dateLimit = getDateLimit(plan);

    const activities = await Activity.find({
      team: req.params.teamId,
      createdAt: { $gte: dateLimit } // <-- FILTER APPLIED
    })
      .sort({ createdAt: -1 })
      .populate('user', 'username');

    res.json(activities);
  } catch (error) {
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};
