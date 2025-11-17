const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');
const { logActivity } = require('../services/activityService');
const { generateAIDailyBriefing } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

const fetchActionItemsData = async (userId) => {
  // 1. Get user's team IDs
  const userTeams = await Team.find({ owner: userId }).select('_id');
  const teamIds = userTeams.map(team => team._id);

  // 2. Define date ranges
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // 3. Find Today's Meetings
  const todayMeetingsQuery = Meeting.find({
    team: { $in: teamIds },
    meetingTime: { $gte: todayStart, $lte: todayEnd }
  })
  .sort({ meetingTime: 1 })
  .populate('team', 'teamName');

  // 4. Find Actionable Tasks
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

  // 5. Find Weekly Personal Notes
  const weeklyNotesQuery = Note.find({
    user: userId,
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

  // Combine tasks for easier frontend use
  const actionTasks = {
    overdue: overdueTasks,
    dueToday: dueTodayTasks
  };

  return { todayMeetings, actionTasks, weeklyNotes };
};

// @desc    Get overview statistics for the logged-in user
// @route   GET /api/stats/overview
exports.getOverviewStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Find all teams owned by the user
    const userTeams = await Team.find({ owner: userId }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 2. Get counts (These are your existing queries)
    const totalNotes = Note.countDocuments({ user: userId });
    const totalTeams = Team.countDocuments({ owner: userId });
    const totalTasks = Task.countDocuments({ team: { $in: teamIds } });
    const upcomingMeetings = Meeting.countDocuments({
      team: { $in: teamIds },
      meetingTime: { $gte: new Date() }
    });

    // 3. Get data for Task Status chart (Your existing query)
    const taskStats = Task.aggregate([
      { $match: { team: { $in: teamIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // 4. Get recent activity (Your existing query)
    const recentNotes = Note.find({ user: userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title _id');

    // 5. Get next upcoming meetings (Your existing query)
    const nextMeetings = Meeting.find({
      team: { $in: teamIds },
      meetingTime: { $gte: new Date() }
    })
      .sort({ meetingTime: 1 })
      .limit(5)
      .populate('team', 'teamName')
      .select('title meetingTime team');

    // --- 6. NEW: Define Date Range for Activity Line Chart ---
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);

    // --- 7. NEW: Query for Workload Distribution (Bar Chart) ---
    // This query finds all *active* (not completed) tasks and groups them by assignee.
    const workloadQuery = Task.aggregate([
      { $match: { team: { $in: teamIds }, status: { $ne: 'Completed' } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      { $sort: { count: -1 } } // Sort descending
    ]);

    // --- 8. NEW: Query for Tasks Created (Line Chart) ---
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

    // --- 9. NEW: Query for Tasks Completed (Line Chart) ---
    const tasksCompletedQuery = Task.aggregate([
      {
        $match: {
          team: { $in: teamIds },
          status: 'Completed',
          updatedAt: { $gte: startDate, $lte: endDate } // Use updatedAt to see when it was completed
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


    // --- 10. UPDATED: Run all queries in parallel ---
    const [
      notes,
      teams,
      tasks,
      meetingsCount,
      taskStatusData,
      notesActivity,
      meetingsActivity,
      workloadData, // <-- New result
      createdData,  // <-- New result
      completedData // <-- New result
    ] = await Promise.all([
      totalNotes,
      totalTeams,
      totalTasks,
      upcomingMeetings,
      taskStats,
      recentNotes,
      nextMeetings,
      workloadQuery,        // <-- New query
      tasksCreatedQuery,    // <-- New query
      tasksCompletedQuery   // <-- New query
    ]);

    // Format task stats for the chart (Your existing code)
    const taskChartData = taskStatusData.map(stat => ({
      name: stat._id,
      value: stat.count
    }));

    // --- 11. NEW: Format Workload Chart Data ---
    // Map `_id` (which is the name) to `name` for easier frontend use
    const workloadChartData = workloadData.map(item => ({
      name: item._id,
      tasks: item.count
    }));

    // --- 12. NEW: Format Activity Line Chart Data ---
    // Convert array results to a Map for efficient lookups
    const createdMap = new Map(createdData.map(item => [item._id, item.count]));
    const completedMap = new Map(completedData.map(item => [item._id, item.count]));

    const activityChartData = [];
    // Loop from 30 days ago to today
    for (let i = 0; i < 30; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      const dateString = day.toISOString().split('T')[0];

      activityChartData.push({
        date: dateString.substring(5), // Format as "MM-DD"
        created: createdMap.get(dateString) || 0,
        completed: completedMap.get(dateString) || 0
      });
    }

    // --- 13. UPDATED: Send all data in response ---
    res.json({
      stats: {
        totalNotes: notes,
        totalTeams: teams,
        totalTasks: tasks,
        upcomingMeetings: meetingsCount
      },
      taskChartData,
      recentNotes: notesActivity,
      upcomingMeetings: meetingsActivity,
      workloadChartData,  // <-- Add new data
      activityChartData   // <-- Add new data
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Get all action items for the leader's 'Today' page
// @route   GET /api/stats/action-items
exports.getActionItems = async (req, res) => {
  try {
    // --- THIS FUNCTION IS NOW SIMPLER ---
    const data = await fetchActionItemsData(req.user.id);
    res.json(data);
    // --- END OF CHANGE ---

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

/**
 * @desc    Get AI-powered daily briefing
 * @route   GET /api/stats/briefing
 */
exports.getAIDailyBriefing = async (req, res) => {
  try {
    // 1. Get the same data as getActionItems
    const actionItems = await fetchActionItemsData(req.user.id);

    // 2. Get the user's name for personalization
    const username = req.user.username;

    // 3. Call the AI service
    const briefing = await generateAIDailyBriefing(username, actionItems);

    logAiAction(req.user.id, 'AI_DAILY_BRIEFING');

    // 4. Send the briefing back
    res.json({ briefing });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};
