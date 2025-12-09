const AiLog = require('../models/AiLog');
const User = require('../models/User');
const mongoose = require('mongoose');
const { checkAndResetDailyUsage } = require('../services/usageService');
const { logError } = require('../services/logService');

// Define Limits helper (Keep synchronized with subscriptionMiddleware)
const getPlanLimit = (plan) => {
  const PLAN_LIMITS = { free: 10, professional: 100, premium: 9999 };
  return PLAN_LIMITS[plan] || 10;
};

// Helper for history retention date
const getDateLimit = (plan) => {
  const now = new Date();
  if (plan === 'free') {
    now.setDate(now.getDate() - 7);
    return now;
  } else if (plan === 'professional') {
    now.setDate(now.getDate() - 30);
    return now;
  } else {
    return new Date(0);
  }
};

// @desc    Get AI usage stats
// @route   GET /api/ai-usage/stats
exports.getUsageStats = async (req, res) => {
  try {
    await checkAndResetDailyUsage(req.user.id);
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // 1. Resolve Billing Owner & Plan
    let owner;
    if (req.user.role === 'owner') {
      owner = req.user; // Already fetched by middleware (usually)
      // If subscription missing (middleware variation), fetch it:
      if (!owner.subscription) owner = await User.findById(userId);
    } else {
      owner = await User.findById(req.user.ownerId);
    }

    const currentPlan = owner?.subscription?.plan || 'free';
    const dateLimit = getDateLimit(currentPlan); // <--- CALCULATE LIMIT

    // --- OWNER VIEW ---
    if (req.user.role === 'owner') {

      const managers = await User.find({ ownerId: userId })
        .select('username aiAllocatedLimit subscription.aiUsageCount');

      const totalLimit = getPlanLimit(currentPlan);
      const reserved = managers.reduce((sum, m) => sum + (m.aiAllocatedLimit !== null ? m.aiAllocatedLimit : 0), 0);
      const sharedPoolLimit = Math.max(0, totalLimit - reserved);

      const allUserIds = [userId, ...managers.map(m => m._id)];

      const usageByAction = await AiLog.aggregate([
        {
          $match: {
            user: { $in: allUserIds },
            createdAt: { $gte: dateLimit } // <--- APPLY FILTER
          }
        },
        {
          $group: {
            _id: { user: "$user", action: "$actionType" },
            count: { $sum: 1 }
          }
        }
      ]);

      const getActionsForUser = (uid) => {
        return usageByAction
          .filter(u => u._id.user.toString() === uid.toString())
          .map(u => ({ action: u._id.action, count: u.count }));
      };

      const memberStats = managers.map(mgr => ({
        _id: mgr._id,
        username: mgr.username,
        used: mgr.subscription.aiUsageCount,
        limit: mgr.aiAllocatedLimit,
        actions: getActionsForUser(mgr._id)
      }));

      const ownerActions = getActionsForUser(userId);

      res.json({
        role: 'owner',
        plan: currentPlan,
        overview: {
          totalLimit: totalLimit,
          sharedPoolLimit: sharedPoolLimit,
          reserved: reserved,
          ownerUsage: req.user.subscription.aiUsageCount,
        },
        members: memberStats,
        ownerActions
      });

    } else {
      // --- MANAGER VIEW ---

      const actions = await AiLog.aggregate([
        {
          $match: {
            user: userId,
            createdAt: { $gte: dateLimit } // <--- APPLY FILTER
          }
        },
        { $group: { _id: "$actionType", count: { $sum: 1 } } }
      ]);

      res.json({
        role: 'manager',
        used: req.user.subscription.aiUsageCount,
        limit: req.user.aiAllocatedLimit === null ? 'Shared Pool' : req.user.aiAllocatedLimit,
        actions: actions.map(a => ({ action: a._id, count: a.count }))
      });
    }

  } catch (error) {
    console.error('Get AI Stats Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update Manager AI Allocation
// @route   PUT /api/ai-usage/allocate
exports.updateAllocation = async (req, res) => {
  try {
    // Only Owners can allocate
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Only Owners can allocate limits.' });
    }

    const { managerId, limit } = req.body; // limit can be a Number or null

    // 1. Find the Manager (ensure they belong to this owner)
    const manager = await User.findOne({ _id: managerId, ownerId: req.user.id });
    if (!manager) {
      return res.status(404).json({ message: 'Manager not found.' });
    }

    // 2. Validate Capacity
    // We must ensure the new allocation doesn't exceed the total plan limit
    const currentPlan = req.user.subscription?.plan || 'free';
    const totalCapacity = getPlanLimit(currentPlan);

    // Fetch all *other* managers to calculate what is already reserved
    const otherManagers = await User.find({
      ownerId: req.user.id,
      _id: { $ne: managerId }
    });

    const currentReserved = otherManagers.reduce((sum, m) => sum + (m.aiAllocatedLimit || 0), 0);

    // The value requested to be set (null = 0 reserved)
    const newLimitVal = (limit === 'null' || limit === null) ? 0 : parseInt(limit);

    if ((currentReserved + newLimitVal) > totalCapacity) {
      return res.status(400).json({
        message: `Allocation failed. You only have ${totalCapacity - currentReserved} credits remaining to allocate.`
      });
    }

    // 3. Update the Manager
    manager.aiAllocatedLimit = (limit === 'null' || limit === null) ? null : parseInt(limit);
    await manager.save();

    res.json({ message: 'Limit updated successfully', manager });

  } catch (error) {
    console.error('Update Allocation Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
