const User = require('../models/User');
const Team = require('../models/Team');
const MemberProfile = require('../models/MemberProfile');
const { checkAndResetDailyUsage } = require('../services/usageService');

// Define Limits for each Tier
const PLAN_LIMITS = {
  free: {
    teams: 1,
    managers: 0,
    aiRequests: 10,
    members: 5 // <-- Limit
  },
  professional: {
    teams: 5,
    managers: 3,
    aiRequests: 100,
    members: 50 // <-- Limit
  },
  premium: {
    teams: 9999,
    managers: 9999,
    aiRequests: 9999,
    members: 9999 // Unlimited
  }
};

// Helper: Get User's Plan Limits
const getLimits = (user) => {
  const plan = user.subscription?.plan || 'free';
  return PLAN_LIMITS[plan];
};

// 1. Check Team Creation Limit
exports.checkTeamLimit = async (req, res, next) => {
  try {
    // Only Owners create teams (or Managers using Owner's quota - advanced logic)
    // For now, let's assume we check the logged-in user's limit.
    const limits = getLimits(req.user);

    const teamCount = await Team.countDocuments({ owner: req.user.id });

    if (teamCount >= limits.teams) {
      return res.status(403).json({
        message: `Upgrade your plan to create more teams. (Limit: ${limits.teams})`
      });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server Error checking subscription limits' });
  }
};

// 2. Check Manager Creation Limit
exports.checkManagerLimit = async (req, res, next) => {
  try {
    const limits = getLimits(req.user);

    const managerCount = await User.countDocuments({ ownerId: req.user.id });

    if (managerCount >= limits.managers) {
      return res.status(403).json({
        message: `Upgrade your plan to hire more managers. (Limit: ${limits.managers})`
      });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server Error checking subscription limits' });
  }
};

// 3. Check AI Usage Limit (and reset if new day)
exports.checkAiLimit = async (req, res, next) => {
  try {
    // --- 1. RUN DAILY RESET CHECK FIRST ---
    // This ensures data is fresh before we check limits
    await checkAndResetDailyUsage(req.user.id);
    // --------------------------------------

    const userId = req.user.id;
    // We fetch user *after* the reset potential to get updated counts
    const user = await User.findById(userId);

    // Determine Owner
    let owner;
    if (user.role === 'owner') {
      owner = user;
    } else {
      owner = await User.findById(user.ownerId);
    }

    if (!owner) return res.status(403).json({ message: 'Owner account not found.' });

    const limits = getLimits(owner);
    const totalPlanLimit = limits.aiRequests;

    // Calculate Reserved Pool
    const allManagers = await User.find({ ownerId: owner._id });
    const reservedUsage = allManagers.reduce((sum, mgr) => {
      return sum + (mgr.aiAllocatedLimit !== null ? mgr.aiAllocatedLimit : 0);
    }, 0);

    const sharedPoolLimit = Math.max(0, totalPlanLimit - reservedUsage);

    let allow = false;
    let limitMessage = '';

    if (user.role === 'manager' && user.aiAllocatedLimit !== null) {
      // Dedicated Limit
      if (user.subscription.aiUsageCount < user.aiAllocatedLimit) allow = true;
      else limitMessage = `You have reached your assigned AI limit of ${user.aiAllocatedLimit}.`;
    } else {
      // Shared Pool
      const ownerUsage = owner.subscription.aiUsageCount;
      const unallocatedManagersUsage = allManagers.reduce((sum, mgr) => {
        return sum + (mgr.aiAllocatedLimit === null ? mgr.subscription.aiUsageCount : 0), 0;
      }, 0);
      const currentSharedUsage = ownerUsage + unallocatedManagersUsage;

      if (currentSharedUsage < sharedPoolLimit) allow = true;
      else limitMessage = `The organization's shared AI pool is exhausted (${currentSharedUsage}/${sharedPoolLimit}). Upgrade plan.`;
    }

    if (!allow) return res.status(403).json({ message: limitMessage });

    req.userWithSubscription = user;
    next();

  } catch (error) {
    console.error("AI Limit Check Error:", error);
    res.status(500).json({ message: 'Server Error checking AI limits' });
  }
};

exports.checkMemberLimit = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return next(); // Validation will handle missing name later

    // 1. Identify Owner
    const user = req.user;
    let ownerId = user.role === 'owner' ? user._id : user.ownerId;

    if (user.role === 'owner') {
        // Owner logic is simple
    } else {
        // If Manager, ensure we have the Owner ID
        if (!ownerId) {
             // Fallback: fetch user again if ownerId is missing (should be populated by protect, but safe to check)
             const freshUser = await User.findById(user._id);
             ownerId = freshUser.ownerId;
        }
    }

    const owner = user.role === 'owner' ? user : await User.findById(ownerId);
    const limits = getLimits(owner);

    // 2. Get all teams in the organization (Owner + All Managers)
    // We reuse the logic: Owner sees all, Manager sees specific.
    // BUT for limits, we must count the ORGANIZATIONS total members.

    const managers = await User.find({ ownerId: owner._id }).distinct('_id');
    const allAllowedIds = [owner._id, ...managers];

    const teams = await Team.find({ owner: { $in: allAllowedIds } }).select('members');

    // 3. Count unique members
    const uniqueMembers = new Set();
    teams.forEach(team => {
      team.members.forEach(member => uniqueMembers.add(member));
    });

    // 4. Check if NEW member exceeds limit
    // If the name is already in the set, it's an update/assignment, not a new "seat".
    if (!uniqueMembers.has(name)) {
      if (uniqueMembers.size >= limits.members) {
        return res.status(403).json({
          message: `Member limit reached (${limits.members}). Upgrade to add more employees.`
        });
      }
    }

    next();
  } catch (error) {
    console.error('Check Member Limit Error:', error);
    res.status(500).json({ message: 'Server Error checking member limit' });
  }
};
