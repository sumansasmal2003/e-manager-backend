const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');

// @desc    Get overview statistics for the logged-in user
// @route   GET /api/stats/overview
exports.getOverviewStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Find all teams owned by the user
    const userTeams = await Team.find({ owner: userId }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 2. Get counts
    const totalNotes = Note.countDocuments({ user: userId });
    const totalTeams = Team.countDocuments({ owner: userId });
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

    // 4. Get recent activity (e.g., 5 recent notes)
    const recentNotes = Note.find({ user: userId })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title _id');

    // 5. Get next upcoming meetings
    const nextMeetings = Meeting.find({
      team: { $in: teamIds },
      meetingTime: { $gte: new Date() }
    })
      .sort({ meetingTime: 1 })
      .limit(5)
      .populate('team', 'teamName')
      .select('title meetingTime team');

    // 6. Run all queries in parallel
    const [
      notes,
      teams,
      tasks,
      meetingsCount,
      taskStatusData,
      notesActivity,
      meetingsActivity
    ] = await Promise.all([
      totalNotes,
      totalTeams,
      totalTasks,
      upcomingMeetings,
      taskStats,
      recentNotes,
      nextMeetings
    ]);

    // Format task stats for the chart
    const taskChartData = taskStatusData.map(stat => ({
      name: stat._id,
      value: stat.count
    }));

    res.json({
      stats: {
        totalNotes: notes,
        totalTeams: teams,
        totalTasks: tasks,
        upcomingMeetings: meetingsCount
      },
      taskChartData,
      recentNotes: notesActivity,
      upcomingMeetings: meetingsActivity
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all action items for the leader's 'Today' page
// @route   GET /api/stats/action-items
exports.getActionItems = async (req, res) => {
  try {
    const userId = req.user.id;

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

    res.json({
      todayMeetings,
      actionTasks,
      weeklyNotes
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
