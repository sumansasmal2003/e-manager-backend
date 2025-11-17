const Team = require('../models/Team');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const User = require('../models/User'); // <-- IMPORT USER
const { getGoogleCalendarClient } = require('../services/googleCalendarService');
const { logError } = require('../services/logService');

// @desc    Get all calendar events (tasks and meetings) for the logged-in user
// @route   GET /api/calendar
exports.getCalendarEvents = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('+googleAccessToken +googleRefreshToken');

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

    let googleEvents = [];
    if (user.googleCalendarConnected) {
      try {
        const calendar = await getGoogleCalendarClient(user);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: sevenDaysAgo.toISOString(),
          maxResults: 50,
          singleEvents: true,
          orderBy: 'startTime',
        });

        googleEvents = response.data.items.map(event => ({
          id: `gcal-${event.id}`,
          title: `(GCal) ${event.summary}`,
          start: new Date(event.start.dateTime || event.start.date),
          end: new Date(event.end.dateTime || event.end.date),
          allDay: !!event.start.date, // It's all-day if it has a .date and not .dateTime
          resource: { type: 'gcal' }
        }));
      } catch (error) {
        console.warn('Failed to fetch Google Calendar events:', error.message);
      }
    }

    // 5. Combine and send
    const allEvents = [...taskEvents, ...meetingEvents, ...googleEvents];
    res.json(allEvents);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};
