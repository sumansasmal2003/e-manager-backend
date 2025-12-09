const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');
const User = require('../models/User'); // <-- Import User
const { logActivity } = require('../services/activityService');
const { generateAIDailyBriefing } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');
const { checkAndResetDailyUsage } = require('../services/usageService');

// --- HELPER: Get all Team IDs the user is allowed to see ---
const getAllowedTeamIds = async (user) => {
  let owners = [user.id];

  // If Owner, add all their managers to the list
  if (user.role === 'owner') {
    const managers = await User.find({ ownerId: user.id }).distinct('_id');
    owners = [...owners, ...managers];
  }

  // Find all teams owned by these users
  const teams = await Team.find({ owner: { $in: owners } }).select('_id');
  return teams.map(t => t._id);
};

const fetchActionItemsData = async (user) => {
  // 1. Get all relevant team IDs
  const teamIds = await getAllowedTeamIds(user);

  // 2. Define date ranges
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // 3. Find Today's Meetings (Across all allowed teams)
  const todayMeetingsQuery = Meeting.find({
    team: { $in: teamIds },
    meetingTime: { $gte: todayStart, $lte: todayEnd }
  })
  .sort({ meetingTime: 1 })
  .populate('team', 'teamName');

  // 4. Find Actionable Tasks (Across all allowed teams)
  const overdueTasksQuery = Task.find({
    team: { $in: teamIds },
    dueDate: { $lt: todayStart },
    status: { $ne: 'Completed' }
  });

  const dueTodayTasksQuery = Task.find({
    team: { $in: teamIds },
    dueDate: { $gte: todayStart, $lte: todayEnd },
    status: { $ne: 'Completed' }
  });

  // 5. Find Weekly Personal Notes (Keep these personal to the logged-in user)
  const weeklyNotesQuery = Note.find({
    user: user.id,
    planPeriod: 'This Week'
  }).sort({ createdAt: -1 });

  // 6. Run all queries in parallel
  const [
    todayMeetings,
    overdueTasks,
    dueTodayTasks,
    weeklyNotes
  ] = await Promise.all([
    todayMeetingsQuery,
    overdueTasksQuery,
    dueTodayTasksQuery,
    weeklyNotesQuery
  ]);

  const actionTasks = {
    overdue: overdueTasks,
    dueToday: dueTodayTasks
  };

  return { todayMeetings, actionTasks, weeklyNotes };
};

const getPlanLimit = (plan) => {
  const PLAN_LIMITS = { free: 10, professional: 100, premium: 9999 };
  return PLAN_LIMITS[plan] || 10;
};

// @desc    Get overview statistics for the logged-in user (or Organization for Owner)
// @route   GET /api/stats/overview
exports.getOverviewStats = async (req, res) => {
  try {
    await checkAndResetDailyUsage(req.user.id);
    const userId = req.user.id;

    // 1. Get Team IDs (The Scope)
    const teamIds = await getAllowedTeamIds(req.user);

    let aiStats = { used: 0, limit: 0 };

    if (req.user.role === 'owner') {
        // 1. Fetch Owner's Plan Limit
        const ownerPlan = req.user.subscription?.plan || 'free';
        aiStats.limit = getPlanLimit(ownerPlan);

        // 2. Fetch All Managers linked to Owner
        const managers = await User.find({ ownerId: userId }).select('subscription.aiUsageCount');

        // 3. Sum Owner Usage + All Managers Usage
        const ownerUsage = req.user.subscription?.aiUsageCount || 0;
        const managersUsage = managers.reduce((sum, m) => sum + (m.subscription?.aiUsageCount || 0), 0);

        aiStats.used = ownerUsage + managersUsage;
    } else {
        // Manager View
        aiStats.used = req.user.subscription?.aiUsageCount || 0;

        if (req.user.aiAllocatedLimit !== null) {
            aiStats.limit = req.user.aiAllocatedLimit;
        } else {
            // If shared, fetch owner to get the plan limit
            const owner = await User.findById(req.user.ownerId).select('subscription.plan');
            aiStats.limit = getPlanLimit(owner?.subscription?.plan);
        }
    }

    // 2. Get counts
    // Notes remain personal
    const totalNotes = Note.countDocuments({ user: userId });

    // Teams count depends on role (handled by getAllowedTeamIds logic implicitly?)
    // Actually, teamIds.length IS the total teams count for the dashboard
    const totalTeams = teamIds.length;

    const totalTasks = Task.countDocuments({ team: { $in: teamIds } });
    const upcomingMeetings = Meeting.countDocuments({
      team: { $in: teamIds },
      meetingTime: { $gte: new Date() }
    });

    // 3. Get data for Task Status chart
    const taskStats = Task.aggregate([
      { $match: { team: { $in: teamIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // 4. Get recent activity (Keep personal notes personal)
    const recentNotes = Note.find({ user: userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title _id category updatedAt');

    // 5. Get next upcoming meetings
    const nextMeetings = Meeting.find({
      team: { $in: teamIds },
      meetingTime: { $gte: new Date() }
    })
      .sort({ meetingTime: 1 })
      .limit(5)
      .populate('team', 'teamName')
      .select('title meetingTime team');

    // --- 6. Date Range for Activity Line Chart ---
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    // --- 7. Workload Distribution ---
    const workloadQuery = Task.aggregate([
      { $match: { team: { $in: teamIds }, status: { $ne: 'Completed' } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // --- 8. Tasks Created ---
    const tasksCreatedQuery = Task.aggregate([
      { $match: { team: { $in: teamIds }, createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // --- 9. Tasks Completed ---
    const tasksCompletedQuery = Task.aggregate([
      {
        $match: {
          team: { $in: teamIds },
          status: 'Completed',
          updatedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // --- 10. Run all queries ---
    const [
      notesCount,
      // teamsCount is just teamIds.length
      tasksCount,
      meetingsCount,
      taskStatusData,
      notesActivity,
      meetingsActivity,
      workloadData,
      createdData,
      completedData
    ] = await Promise.all([
      totalNotes,
      // totalTeams (already have it)
      totalTasks,
      upcomingMeetings,
      taskStats,
      recentNotes,
      nextMeetings,
      workloadQuery,
      tasksCreatedQuery,
      tasksCompletedQuery
    ]);

    // Format task stats
    const taskChartData = taskStatusData.map(stat => ({
      name: stat._id,
      value: stat.count
    }));

    // Format Workload
    const workloadChartData = workloadData.map(item => ({
      name: item._id,
      tasks: item.count
    }));

    // Format Activity Line Chart
    const createdMap = new Map(createdData.map(item => [item._id, item.count]));
    const completedMap = new Map(completedData.map(item => [item._id, item.count]));

    const activityChartData = [];
    for (let i = 0; i < 30; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      const dateString = day.toISOString().split('T')[0];

      activityChartData.push({
        date: dateString.substring(5), // "MM-DD"
        created: createdMap.get(dateString) || 0,
        completed: completedMap.get(dateString) || 0
      });
    }

    res.json({
      stats: {
        totalNotes: notesCount,
        totalTeams: totalTeams,
        totalTasks: tasksCount,
        upcomingMeetings: meetingsCount
      },
      aiStats,
      taskChartData,
      recentNotes: notesActivity,
      upcomingMeetings: meetingsActivity,
      workloadChartData,
      activityChartData
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Get all action items for the 'Today' page
// @route   GET /api/stats/action-items
exports.getActionItems = async (req, res) => {
  try {
    // Pass the full user object to check role
    const data = await fetchActionItemsData(req.user);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

/**
 * @desc    Get AI-powered daily briefing
 * @route   GET /api/stats/briefing
 */
exports.getAIDailyBriefing = async (req, res) => {
  try {
    const actionItems = await fetchActionItemsData(req.user);
    const username = req.user.username;

    // Use existing service logic, just passing the aggregated data
    const briefing = await generateAIDailyBriefing(username, actionItems);

    logAiAction(req.user.id, 'AI_DAILY_BRIEFING');
    res.json({ briefing });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};
