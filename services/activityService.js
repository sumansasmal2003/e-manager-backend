const Activity = require('../models/Activity');

/**
 * A central function to log any team-related activity.
 * This is "fire and forget" - we don't wait for it to save.
 *
 * @param {string} teamId - The ID of the team
 * @param {string} userId - The ID of the user performing the action
 * @param {string} actionType - The enum string (e.g., 'TASK_CREATED')
 * @param {string} details - The human-readable string
 */
exports.logActivity = (teamId, userId, actionType, details) => {
  try {
    const activity = new Activity({
      team: teamId,
      user: userId,
      actionType,
      details,
    });

    // We don't use 'await' here.
    // This is a "fire and forget" operation. We don't want
    // to slow down the main API response to wait for this to save.
    activity.save();

  } catch (error) {
    // We only log the error, we don't send it to the user.
    // The main operation (e.g., creating a task) was more important.
    console.error('Failed to log activity:', error.message);
  }
};
