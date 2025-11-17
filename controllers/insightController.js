// controllers/insightController.js
const Insight = require('../models/Insight');
const { gatherAllUserData } = require('./aiChatController');
const { generateProactiveInsights } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

/**
 * A helper function to generate new insights for a user.
 * This is the core logic.
 */
const generateInsightsInternal = async (userId, username) => {
  try {
    // 1. Delete all previous *unread* insights. This prevents clutter.
    await Insight.deleteMany({ user: userId, isRead: false });

    // 2. Gather all data for the AI
    // We don't need timezone for this, so we can pass 'UTC'
    const { dataContext } = await gatherAllUserData(userId, username, 'UTC');

    // 3. Call the AI to get the JSON array string
    const insightsJson = await generateProactiveInsights(dataContext);

    // 4. Parse the AI's response
    const insightsArray = JSON.parse(insightsJson);

    if (insightsArray && insightsArray.length > 0) {
      // 5. Add user ID and save new insights to the database
      const insightsToSave = insightsArray.map(insight => ({
        ...insight,
        user: userId,
        isRead: false,
      }));
      await Insight.insertMany(insightsToSave);

      // 6. Log this one AI action
      logAiAction(userId, 'AI_PROACTIVE_INSIGHT');
    }

    console.log(`Generated ${insightsArray.length} new insights for user ${userId}`);

  } catch (error) {
    console.error(`Failed to generate insights for user ${userId}:`, error.message);
    // Don't log this to DB, it could create a loop
  }
};


// @desc    Get all unread insights, generating new ones if stale
// @route   GET /api/insights
exports.getInsights = async (req, res) => {
  try {
    const userId = req.user.id;
    const username = req.user.username;

    // 1. Check when the last insights were generated
    const latestInsight = await Insight.findOne({ user: userId })
                                       .sort({ createdAt: -1 });

    // Set a "staleness" period (e.g., 1 hour)
    const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60);

    // 2. If no insights exist OR the newest one is > 1 hour old, generate new ones.
    if (!latestInsight || latestInsight.createdAt < oneHourAgo) {
      // We await this. The user will wait a few seconds, but will get
      // the freshest possible insights for their session.
      await generateInsightsInternal(userId, username);
    }

    // 3. Fetch and return all *unread* insights
    const allUnread = await Insight.find({ user: userId, isRead: false })
                                   .sort({ createdAt: -1 });

    res.json(allUnread);

  } catch (error) {
    console.error('Get Insights Error:', error.message);
    // Do not log this error to the DB, it could create a loop
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};


// @desc    Mark a single insight as read
// @route   PUT /api/insights/:id/read
exports.markInsightAsRead = async (req, res) => {
  try {
    const insight = await Insight.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id }, // Security check
      { isRead: true },
      { new: true } // Return the updated document
    );

    if (!insight) {
      return res.status(404).json({ message: 'Insight not found' });
    }

    res.json(insight);
  } catch (error) {
    console.error('Mark Insight Read Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
