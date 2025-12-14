const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { checkAndResetDailyUsage } = require('../services/usageService');
const { generateAIDailyBriefing } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// --- HELPER: Get all Team IDs the user is allowed to see ---
const getAllowedTeamIds = async (user) => {
  if (user.role === 'employee') {
    const teams = await Team.find({
      $or: [
        { employees: user._id },
        { members: user.username }
      ]
    }).select('_id');
    return teams.map(t => t._id);
  }

  let owners = [user._id];
  if (user.role === 'owner') {
    const managers = await User.find({ ownerId: user._id }).distinct('_id');
    owners = [...owners, ...managers];
  }

  const teams = await Team.find({ owner: { $in: owners } }).select('_id');
  return teams.map(t => t._id);
};

const getPlanLimit = (plan) => {
  const PLAN_LIMITS = { free: 10, professional: 100, premium: 9999 };
  return PLAN_LIMITS[plan] || 10;
};

// --- HELPER: Fetch Action Items (Updated for Role Filtering) ---
const fetchActionItemsData = async (user) => {
  // 1. Get relevant team IDs
  const teamIds = await getAllowedTeamIds(user);

  // 2. Define Filters based on Role
  let taskFilter = { team: { $in: teamIds } };
  let meetingFilter = { team: { $in: teamIds } };

  if (user.role === 'employee') {
    // Employees: Only their tasks and their meetings
    taskFilter.assignedTo = user.username;
    meetingFilter.participants = user.username;
  }

  // 3. Define date ranges
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // 4. Find Today's Meetings
  const todayMeetingsQuery = Meeting.find({
    ...meetingFilter,
    meetingTime: { $gte: todayStart, $lte: todayEnd }
  })
  .sort({ meetingTime: 1 })
  .populate('team', 'teamName');

  // 5. Find Actionable Tasks
  const overdueTasksQuery = Task.find({
    ...taskFilter,
    dueDate: { $lt: todayStart },
    status: { $ne: 'Completed' }
  });

  const dueTodayTasksQuery = Task.find({
    ...taskFilter,
    dueDate: { $gte: todayStart, $lte: todayEnd },
    status: { $ne: 'Completed' }
  });

  // 6. Find Weekly Personal Notes (Always personal)
  const weeklyNotesQuery = Note.find({
    user: user._id,
    planPeriod: 'This Week'
  }).sort({ createdAt: -1 });

  // 7. Execute Queries
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

  return {
    todayMeetings,
    actionTasks: {
      overdue: overdueTasks,
      dueToday: dueTodayTasks
    },
    weeklyNotes
  };
};

// @desc    Get overview statistics for the dashboard
// @route   GET /api/stats/overview
exports.getOverviewStats = async (req, res) => {
  try {
    await checkAndResetDailyUsage(req.user.id);
    const userId = req.user._id;
    const username = req.user.username;

    // 1. Get Scope
    const teamIds = await getAllowedTeamIds(req.user);

    // 2. Define Query Filters
    let taskQuery = { team: { $in: teamIds } };
    let meetingQuery = { team: { $in: teamIds }, meetingTime: { $gte: new Date() } };

    if (req.user.role === 'employee') {
      taskQuery.assignedTo = username;
      meetingQuery.participants = username;
    }

    // 3. AI Stats
    let aiStats = { used: 0, limit: 0 };
    if (req.user.role === 'owner') {
        const ownerPlan = req.user.subscription?.plan || 'free';
        aiStats.limit = getPlanLimit(ownerPlan);
        const managers = await User.find({ ownerId: userId }).select('subscription.aiUsageCount');
        const ownerUsage = req.user.subscription?.aiUsageCount || 0;
        const managersUsage = managers.reduce((sum, m) => sum + (m.subscription?.aiUsageCount || 0), 0);
        aiStats.used = ownerUsage + managersUsage;
    } else {
        aiStats.used = req.user.subscription?.aiUsageCount || 0;
        if (req.user.aiAllocatedLimit !== null) {
            aiStats.limit = req.user.aiAllocatedLimit;
        } else {
            const owner = await User.findById(req.user.ownerId || userId).select('subscription.plan');
            aiStats.limit = getPlanLimit(owner?.subscription?.plan);
        }
    }

    // 4. Run Aggregations
    const [
      totalNotes,
      totalTasks,
      upcomingMeetingsCount,
      taskStatusData,
      recentNotes,
      upcomingMeetings,
      attendanceRecord
    ] = await Promise.all([
      Note.countDocuments({ user: userId }),
      Task.countDocuments(taskQuery),
      Meeting.countDocuments(meetingQuery),
      Task.aggregate([
        { $match: taskQuery },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Note.find({ user: userId }).sort({ updatedAt: -1 }).limit(5).select('title category updatedAt'),
      Meeting.find(meetingQuery).sort({ meetingTime: 1 }).limit(5).populate('team', 'teamName').select('title meetingTime team'),
      req.user.role === 'employee' ? Attendance.findOne({ member: username, date: new Date(new Date().setUTCHours(0,0,0,0)) }) : Promise.resolve(null)
    ]);

    const taskChartData = taskStatusData.map(stat => ({ name: stat._id, value: stat.count }));

    // Simplified Activity Chart (Last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);

    let activityMatch = { team: { $in: teamIds }, createdAt: { $gte: startDate } };
    if (req.user.role === 'employee') activityMatch.assignedTo = username;

    const activityData = await Task.aggregate([
      { $match: activityMatch },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } }},
      { $sort: { _id: 1 } }
    ]);

    const activityChartData = [];
    const activityMap = new Map(activityData.map(i => [i._id, i.count]));
    for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const key = d.toISOString().split('T')[0];
        activityChartData.push({ date: key.substring(5), created: activityMap.get(key) || 0 });
    }

    res.json({
      stats: { totalNotes, totalTeams: teamIds.length, totalTasks, upcomingMeetings: upcomingMeetingsCount },
      attendanceStatus: attendanceRecord ? attendanceRecord.status : 'Not Marked',
      aiStats,
      taskChartData,
      recentNotes,
      upcomingMeetings,
      activityChartData,
      workloadChartData: []
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
    const data = await fetchActionItemsData(req.user);
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Get AI-powered daily briefing
// @route   GET /api/stats/briefing
exports.getAIDailyBriefing = async (req, res) => {
  try {
    const actionItems = await fetchActionItemsData(req.user);
    const briefing = await generateAIDailyBriefing(req.user.username, actionItems);
    logAiAction(req.user.id, 'AI_DAILY_BRIEFING');
    res.json({ briefing });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};
