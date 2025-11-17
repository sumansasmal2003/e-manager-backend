// services/logService.js
const SystemLog = require('../models/SystemLog');

/**
 * A central function to log any system-level error.
 * This is "fire and forget" - we don't wait for it to save.
 *
 * @param {string} userId - The ID of the user performing the action
 * @param {Error} error - The caught error object
 * @param {string} route - The API route (e.g., req.originalUrl)
 * @param {string} level - (Optional) 'ERROR', 'WARN', 'INFO'
 */
exports.logError = (userId, error, route = 'N/A', level = 'ERROR') => {
  try {
    // Ensure we have a valid error message
    const message = error.message || 'An unknown error occurred';

    // Create the log entry
    const log = new SystemLog({
      user: userId,
      level,
      route,
      message,
      stack: error.stack || undefined, // Only include stack if it exists
    });

    // We don't use 'await' here. This is a "fire and forget" operation.
    // We don't want to slow down the 500-error response to the user.
    log.save();

  } catch (logError) {
    // If the logger itself fails, log to console
    console.error('CRITICAL: Failed to write to log service:', logError.message);
    console.error('Original Error was:', error.message);
  }
};
