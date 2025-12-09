const User = require('../models/User');

/**
 * Checks if the day has changed since the last reset.
 * If yes, resets the AI usage for the Owner and all their Managers.
 * @param {string} userId - The ID of the current user (Owner or Manager)
 */
exports.checkAndResetDailyUsage = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // 1. Determine the Owner (Billing Account)
    // If user is Owner, they are the billing account.
    // If user is Manager, find their Owner.
    let owner;
    if (user.role === 'owner') {
      owner = user;
    } else {
      owner = await User.findById(user.ownerId);
    }

    if (!owner) return;

    // 2. Check Dates (Using UTC to standardize 12:00 AM globally)
    const now = new Date();
    const lastReset = new Date(owner.subscription.lastUsageReset);

    // Compare YYYY-MM-DD strings
    const todayStr = now.toISOString().split('T')[0];
    const lastResetStr = lastReset.toISOString().split('T')[0];

    // 3. Reset if it's a new day
    if (todayStr !== lastResetStr) {
      console.log(`[Usage Service] New Day detected (${todayStr}). Resetting limits for owner: ${owner._id}`);

      // Reset Owner
      owner.subscription.aiUsageCount = 0;
      owner.subscription.lastUsageReset = now;
      await owner.save();

      // Reset All Managers linked to this Owner
      await User.updateMany(
        { ownerId: owner._id },
        { 'subscription.aiUsageCount': 0 }
      );
    }
  } catch (error) {
    console.error('Error in checkAndResetDailyUsage:', error.message);
    // Don't crash the app, just log it.
  }
};
