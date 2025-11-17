// controllers/aiUsageController.js
const AiLog = require('../models/AiLog');
const mongoose = require('mongoose');
const { logError } = require('../services/logService');

// @desc    Get all AI usage statistics
// @route   GET /api/ai-usage/stats
exports.getUsageStats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // --- 1. Get 30-Day Trend Data (for Line Chart) ---
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);

    const usageOverTime = await AiLog.aggregate([
      { $match: {
          user: userId,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          queries: {
            $sum: { $cond: [{ $eq: ["$actionType", "AI_GET_ANSWER"] }, 1, 0] }
          },
          actions: {
            $sum: { $cond: [{ $ne: ["$actionType", "AI_GET_ANSWER"] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } },
      { $project: {
          date: "$_id",
          queries: 1,
          actions: 1,
          _id: 0
        }
      }
    ]);

    // --- 2. Get Action Distribution (for Pie Chart) ---
    const actionDistribution = await AiLog.aggregate([
      { $match: { user: userId } },
      { $group: {
          _id: "$actionType",
          value: { $sum: 1 }
        }
      },
      { $project: {
          name: "$_id",
          value: 1,
          _id: 0
        }
      }
    ]);

    // --- 3. Get Stat Cards ---
    const totalActions = await AiLog.countDocuments({ user: userId });
    const chatQueries = await AiLog.countDocuments({ user: userId, actionType: 'AI_GET_ANSWER' });
    const tasksManaged = await AiLog.countDocuments({
      user: userId,
      actionType: { $in: ['AI_CREATE_TASK', 'AI_UPDATE_TASKS', 'AI_DELETE_TASKS', 'AI_GENERATE_SUBTASKS'] }
    });
    const itemsCreated = await AiLog.countDocuments({
      user: userId,
      actionType: { $in: ['AI_CREATE_TASK', 'AI_SCHEDULE_MEETING', 'AI_ADD_NOTE'] }
    });

    res.json({
      stats: {
        totalActions,
        chatQueries,
        tasksManaged,
        itemsCreated,
      },
      usageOverTime,
      actionDistribution
    });

  } catch (error) {
    console.error('Get AI Stats Error:', error.message);
    logError(userId, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
