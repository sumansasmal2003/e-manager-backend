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
    members: 5
  },
  professional: {
    teams: 5,
    managers: 3,
    aiRequests: 100,
    members: 50
  },
  premium: {
    teams: 9999,
    managers: 9999,
    aiRequests: 9999,
    members: 9999
  }
};

// Helper: Get User's Plan Limits
const getLimits = (user) => {
  const plan = user.subscription?.plan || 'free';
  return PLAN_LIMITS[plan] || PLAN_LIMITS['free'];
};

// 1. Check Team Creation Limit (Organization Wide)
exports.checkTeamLimit = async (req, res, next) => {
  try {
    const limits = getLimits(req.user);

    // FIX: Get all managers under this Owner
    const managers = await User.find({ ownerId: req.user._id }).distinct('_id');

    // FIX: Check count for Owner AND Managers
    // This ensures teams transferred to managers still count towards the Owner's plan limit
    const allAccountIds = [req.user._id, ...managers];

    const teamCount = await Team.countDocuments({ owner: { $in: allAccountIds } });

    console.log(`[Limit Check] User: ${req.user.username} | Plan: ${req.user.subscription?.plan} | Org Teams: ${teamCount} | Limit: ${limits.teams}`);

    if (teamCount >= limits.teams) {
      return res.status(403).json({
        message: `Plan limit reached. Your organization has ${teamCount} team(s) and your plan limit is ${limits.teams}. Please upgrade to create more.`
      });
    }
    next();
  } catch (error) {
    console.error("Check Team Limit Error:", error);
    res.status(500).json({ message: 'Server Error checking subscription limits' });
  }
};

// 2. Check Manager Creation Limit
exports.checkManagerLimit = async (req, res, next) => {
  try {
    const limits = getLimits(req.user);

    const managerCount = await User.countDocuments({ ownerId: req.user._id });

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

// 3. Check AI Usage Limit
exports.checkAiLimit = async (req, res, next) => {
  try {
    // --- 1. Check Permission First ---
    if (req.user.permissions?.canUseAI === false) {
      return res.status(403).json({ message: "AI access has been disabled by your administrator." });
    }

    await checkAndResetDailyUsage(req.user.id);
    const userId = req.user.id;
    const user = await User.findById(userId);

    let owner;
    if (user.role === 'owner') { owner = user; } else { owner = await User.findById(user.ownerId); }
    if (!owner) return res.status(403).json({ message: 'Owner not found.' });

    const limits = getLimits(owner);
    const totalPlanLimit = limits.aiRequests;
    const allManagers = await User.find({ ownerId: owner._id });
    const reservedUsage = allManagers.reduce((sum, mgr) => sum + (mgr.aiAllocatedLimit !== null ? mgr.aiAllocatedLimit : 0), 0);
    const sharedPoolLimit = Math.max(0, totalPlanLimit - reservedUsage);

    let allow = false;
    let limitMessage = '';

    if (user.role === 'manager' && user.aiAllocatedLimit !== null) {
      if (user.subscription.aiUsageCount < user.aiAllocatedLimit) allow = true;
      else limitMessage = `AI limit reached (${user.aiAllocatedLimit}).`;
    } else {
      const ownerUsage = owner.subscription.aiUsageCount;
      const unallocatedManagersUsage = allManagers.reduce((sum, mgr) => sum + (mgr.aiAllocatedLimit === null ? mgr.subscription.aiUsageCount : 0), 0);
      const currentSharedUsage = ownerUsage + unallocatedManagersUsage;
      if (currentSharedUsage < sharedPoolLimit) allow = true;
      else limitMessage = `Org AI pool exhausted (${currentSharedUsage}/${sharedPoolLimit}). Upgrade plan.`;
    }

    if (!allow) return res.status(403).json({ message: limitMessage });
    req.userWithSubscription = user;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server Error checking AI limits' });
  }
};

// 4. Check Member Limit
exports.checkMemberLimit = async (req, res, next) => {
  try {
    const newMemberName = req.body.name || req.body.username;
    if (!newMemberName) return next();

    const user = req.user;
    let ownerId = user.role === 'owner' ? user._id : user.ownerId;

    if (!ownerId && user.role !== 'owner') {
         const freshUser = await User.findById(user._id);
         ownerId = freshUser.ownerId;
    }

    const owner = user.role === 'owner' ? user : await User.findById(ownerId);
    const limits = getLimits(owner);

    // Get all teams in the organization
    const managers = await User.find({ ownerId: owner._id }).distinct('_id');
    const allAllowedIds = [owner._id, ...managers];

    const teams = await Team.find({ owner: { $in: allAllowedIds } }).select('members');

    // Count unique members
    const uniqueMembers = new Set();
    teams.forEach(team => {
      team.members.forEach(member => uniqueMembers.add(member));
    });

    if (!uniqueMembers.has(newMemberName)) {
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
