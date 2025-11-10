const Team = require('../models/Team');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');

// @desc    Get all calendar events (tasks and meetings) for the logged-in user
// @route   GET /api/calendar
exports.getCalendarEvents = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Find all teams owned by the user
    const userTeams = await Team.find({ owner: userId }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 2. Find all tasks and meetings for those teams
    const tasksQuery = Task.find({
      team: { $in: teamIds },
      dueDate: { $exists: true } // Only get tasks that have a due date
    });

    const meetingsQuery = Meeting.find({
      team: { $in: teamIds }
    });

    const [tasks, meetings] = await Promise.all([tasksQuery, meetingsQuery]);

    // 3. Format tasks as calendar events
    const taskEvents = tasks.map(task => ({
      id: task._id,
      title: `(Task) ${task.title}`,
      start: task.dueDate,
      end: task.dueDate, // Tasks are all-day events
      allDay: true,
      resource: { type: 'task', teamId: task.team }
    }));

    // 4. Format meetings as calendar events
    const meetingEvents = meetings.map(meeting => {
      // Assume a 1-hour duration for meetings
      const startTime = new Date(meeting.meetingTime);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // + 1 hour

      return {
        id: meeting._id,
        title: `(Meeting) ${meeting.title}`,
        start: startTime,
        end: endTime,
        allDay: false,
        resource: { type: 'meeting', teamId: meeting.team }
      };
    });

    // 5. Combine and send
    const allEvents = [...taskEvents, ...meetingEvents];
    res.json(allEvents);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
