// services/aiLogService.js
const AiLog = require('../models/AiLog');

/**
 * A central function to log any AI-related action.
 * This is "fire and forget" - we don't wait for it to save.
 *
 * @param {string} userId - The ID of the user performing the action
 * @param {string} actionType - The enum string (e.g., 'AI_CREATE_TASK')
 */
exports.logAiAction = (userId, actionType) => {
  try {
    const log = new AiLog({
      user: userId,
      actionType,
    });

    // We don't use 'await' here. This is a "fire and forget" operation.
    log.save();

  } catch (error) {
    // We only log the error, we don't send it to the user.
    console.error('Failed to log AI action:', error.message);
  }
};
