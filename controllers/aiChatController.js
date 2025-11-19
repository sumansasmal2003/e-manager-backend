// controllers/aiChatController.js
const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');
const MemberProfile = require('../models/MemberProfile');
const Attendance = require('../models/Attendance');
const TeamNote = require('../models/TeamNote');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// Import our two AI services: one to decide *what* to do, one to *talk*
const {
  determineUserIntent,
  generateChatResponse
} = require('../services/reportService');

const { createZoomLink } = require('../controllers/meetingController');

/**
 * Gathers all relevant data for a user to build an AI context.
 */
exports.gatherAllUserData = async (userId, username, timezone) => {
  // 1. Fetch all data in parallel
  const [
    userTeams,
    userNotes,
    userMemberProfiles,
  ] = await Promise.all([
    Team.find({ owner: userId }).lean(),
    Note.find({ user: userId }).lean(),
    MemberProfile.find({ leader: userId }).lean(),
  ]);

  const teamIds = userTeams.map(t => t._id);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    userTasks,
    userMeetings,
    userTeamNotes,
    recentAttendance,
    attendanceSummary,
    allHolidays,
  ] = await Promise.all([
    Task.find({ team: { $in: teamIds } }).lean(),
    Meeting.find({ team: { $in: teamIds } }).lean(),
    TeamNote.find({ team: { $in: teamIds } }).lean(),
    Attendance.find({
      leader: userId,
      date: { $gte: thirtyDaysAgo }
    }).sort({ date: -1 }).lean(),

    // 2. Get all-time aggregate counts, grouped by member and status
    Attendance.aggregate([
      { $match: { leader: userId } },
      { $group: {
          _id: { member: "$member", status: "$status" },
          count: { $sum: 1 }
        }
      },
      { $project: {
          _id: 0,
          member: "$_id.member",
          status: "$_id.status",
          count: "$count"
        }
      }
    ]),

    // 3. Get all holiday records, as users often ask for these
    Attendance.find({ leader: userId, status: 'Holiday' }).sort({ date: -1 }).lean()
  ]);

  // 2. Serialize Data into a Context String
  let dataContext = "--- START OF USER'S ACCOUNT DATA ---\n\n";
  dataContext += `Today's Date: ${new Date().toLocaleDateString('en-CA')}\n`; // YYYY-MM-DD
  dataContext += `The User's Name: ${username}\n\n`;
  dataContext += `The User's Local Timezone: ${timezone || 'UTC'}\n\n`;

  dataContext += "## TEAMS (User is the Owner) ##\n";
  userTeams.forEach(team => {
    dataContext += `- Team Name: "${team.teamName}", Team ID: "${team._id}", Members: [${team.members.join(', ')}]\n`;
  });

  dataContext += "\n## TASKS ##\n";
  userTasks.forEach(task => {
    dataContext += `- ${task.title} (Status: ${task.status}, Assigned: ${task.assignedTo}, Team: ${userTeams.find(t => t._id.equals(task.team))?.teamName}, Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-CA') : 'N/A'})\n`;
  });

  dataContext += "\n## MEETINGS ##\n";
  userMeetings.forEach(meeting => {
    dataContext += `- ${meeting.title} (Team: ${userTeams.find(t => t._id.equals(meeting.team))?.teamName}, Time: ${new Date(meeting.meetingTime).toLocaleString()}, Participants: ${meeting.participants.join(', ')})\n`;
  });

  dataContext += "\n## MEMBER PROFILES ##\n";
  userMemberProfiles.forEach(profile => {
    dataContext += `- ${profile.name} (Email: ${profile.email || 'N/A'})\n`;
  });

  dataContext += "\n## ATTENDANCE TOTALS (All-Time) ##\n";
  const summaryByMember = attendanceSummary.reduce((acc, item) => {
    if (!acc[item.member]) acc[item.member] = {};
    acc[item.member][item.status] = item.count;
    return acc;
  }, {});
  for (const [member, stats] of Object.entries(summaryByMember)) {
    const statsString = Object.entries(stats).map(([status, count]) => `${status}: ${count}`).join(', ');
    dataContext += `- ${member}: ${statsString}\n`;
  }

  // Add the recent 30-day records
  dataContext += "\n## RECENT ATTENDANCE (Last 30 Days) ##\n";
  recentAttendance.forEach(att => {
    dataContext += `- ${att.member} was ${att.status} on ${new Date(att.date).toLocaleDateString('en-CA')}\n`;
  });

  // Add all holidays
  dataContext += "\n## ALL RECORDED HOLIDAYS ##\n";
  allHolidays.forEach(att => {
    dataContext += `- ${att.member} (or all) had a Holiday on ${new Date(att.date).toLocaleDateString('en-CA')}\n`;
  });

  dataContext += "\n## PERSONAL NOTES (Titles) ##\n";
  userNotes.forEach(note => {
    dataContext += `- ${note.title} (Category: ${note.category})\n`;
  });

  dataContext += "\n--- END OF USER'S ACCOUNT DATA ---\n";

  // Return both the string context and the raw data for validation
  return { dataContext, userTeams };
};


const buildFilterQuery = (findPayload, userTeams) => {
  const query = {};
  const { teamName, assignedTo, title, status, dueDate } = findPayload;

  // 1. Filter by Team
  if (teamName) {
    const team = userTeams.find(t => t.teamName.toLowerCase() === teamName.toLowerCase());
    if (team) {
      query.team = team._id;
    } else {
      // If team is specified but not found, return an error flag
      throw new Error(`Team not found: ${teamName}`);
    }
  }

  // 2. Filter by other properties
  if (assignedTo) {
    query.assignedTo = assignedTo;
  }
  if (title) {
    query.title = { $regex: new RegExp(title, 'i') };
  }
  if (status) {
    query.status = status;
  }

  // 3. Handle Date Filter (this is the key fix)
  if (dueDate) {
    // Check if it's a date-only string "YYYY-MM-DD"
    if (dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const startOfDay = new Date(dueDate);
      startOfDay.setUTCHours(0, 0, 0, 0); // Start of the day in UTC

      const endOfDay = new Date(dueDate);
      endOfDay.setUTCHours(23, 59, 59, 999); // End of the day in UTC

      query.dueDate = { $gte: startOfDay, $lte: endOfDay };
    } else {
      // It's a full ISO string, use it directly
      query.dueDate = new Date(dueDate);
    }
  }

  return query;
};

/**
 * @desc    Ask a question to the AI chatbot (Router Function)
 * @route   POST /api/chat/ask
 */
exports.askAiChatbot = async (req, res) => {
  const { history, question, timezone } = req.body;
  const userId = req.user.id;
  const username = req.user.username;

  try {
    // 1. Gather all data for context
    const { dataContext, userTeams } = await gatherAllUserData(userId, username, timezone);
    const teamIds = userTeams.map(t => t._id); // Get team IDs for filtering

    // 2. AI Call 1: Determine what the user *wants* to do
    const intentResponse = await determineUserIntent(question, dataContext, history);
    const intent = JSON.parse(intentResponse);

    // 3. Act as a router based on the AI's intent
    switch (intent.action) {

      // --- ACTION: CREATE A TASK ---
      case 'CREATE_TASK': {
        logAiAction(userId, 'AI_CREATE_TASK');
        const { teamName, assignedTo, title, description, dueDate } = intent.payload;

        // Validation 1: Find the team
        const team = userTeams.find(t => t.teamName.toLowerCase() === teamName.toLowerCase());
        if (!team) {
          return res.json({ response: `Sorry, I couldn't find a team named "${teamName}". I can't create the task.` });
        }

        // Validation 2: Check if member is in that team
        if (!team.members.includes(assignedTo)) {
          return res.json({ response: `Sorry, I can't assign that task. The member "${assignedTo}" is not in the "${teamName}" team.` });
        }

        const newTask = new Task({
          team: team._id,
          title,
          description: description || '',
          status: 'Pending',
          assignedTo,
          createdBy: userId,
          dueDate: dueDate ? new Date(dueDate) : null,
        });

        await newTask.save();
        return res.json({ response: `OK! I've created the task "${title}" and assigned it to ${assignedTo}.` });
      }

      // --- ACTION: SCHEDULE A MEETING ---
      case 'SCHEDULE_MEETING': {
        logAiAction(userId, 'AI_SCHEDULE_MEETING');
        const { teamName, title, agenda, meetingTime, participants } = intent.payload;

        const team = userTeams.find(t => t.teamName.toLowerCase() === teamName.toLowerCase());
        if (!team) {
          return res.json({ response: `Sorry, I couldn't find a team named "${teamName}". I can't schedule the meeting.` });
        }

        // The `meetingTime` from the AI is now a correct UTC ISO string
        let newMeetingLink = 'No meeting link generated.';
        try {
          // Call our new service function
          newMeetingLink = await createZoomLink(title, meetingTime, timezone);
        } catch (zoomError) {
          console.error("Zoom generation failed, creating meeting without link:", zoomError.message);
          newMeetingLink = 'Failed to generate Zoom link.';
        }

        const newMeeting = new Meeting({
          team: team._id,
          title,
          agenda: agenda || '',
          meetingTime: new Date(meetingTime), // Save the correct UTC time
          meetingLink: newMeetingLink, // Use the real link
          createdBy: userId,
          participants: participants || team.members,
        });

        await newMeeting.save();
        return res.json({ response: `Done. I've scheduled the meeting "${title}" for ${new Date(meetingTime).toLocaleString()} and generated a Zoom link.` });
      }

      // --- ACTION: ADD A PERSONAL NOTE ---
      case 'ADD_NOTE': {
        logAiAction(userId, 'AI_ADD_NOTE');
        const { title, content, category, planPeriod } = intent.payload;

        const newNote = new Note({
          user: userId,
          title,
          content: content || '',
          category: category || 'Personal',
          planPeriod: planPeriod || 'General',
        });

        await newNote.save();
        return res.json({ response: `Got it. I've saved the note "${title}" to your personal notes.` });
      }

      // --- ACTION: UPDATE A TASK ---
      case 'UPDATE_TASKS': {
        logAiAction(userId, 'AI_UPDATE_TASKS');
        const { find, updates } = intent.payload;

        if (!find || Object.keys(find).length === 0) {
          return res.json({ response: "I'm sorry, I need to know *which* tasks you want to update. Please provide some filters (like team, status, or date)." });
        }
        if (!updates || Object.keys(updates).length === 0) {
          return res.json({ response: "OK, I found the tasks, but what would you like me to change? (e.g., 'set status to completed')" });
        }

        let query;
        try {
          query = buildFilterQuery(find, userTeams);
        } catch (e) {
          return res.json({ response: `Sorry, I can't do that. ${e.message}` });
        }

        // **SECURITY**: Ensure all actions are scoped to the user's teams
        query.team = { $in: teamIds, ...(query.team ? { $eq: query.team } : {}) };

        // --- Validation for new assignee ---
        if (updates.assignedTo) {
          // This check is tricky for bulk updates across multiple teams.
          // We'll simplify: if an assignee is provided, we must also have a teamName.
          if (!find.teamName) {
            return res.json({ response: "To reassign tasks, please specify *which team's* tasks you want to update." });
          }
          const team = userTeams.find(t => t.teamName.toLowerCase() === find.teamName.toLowerCase());
          if (!team.members.includes(updates.assignedTo)) {
            return res.json({ response: `Sorry, I can't reassign those tasks. The member "${updates.assignedTo}" is not in the "${team.teamName}" team.` });
          }
        }

        // Perform the bulk update
        const result = await Task.updateMany(query, { $set: updates });

        if (result.nModified === 0) {
          return res.json({ response: "I found 0 tasks that matched your criteria. No tasks were updated." });
        }

        return res.json({ response: `OK! I've updated ${result.nModified} task(s) that matched your criteria.` });
      }

      // --- *** NEW: ACTION: DELETE TASKS (Bulk) *** ---
      case 'DELETE_TASKS': {
        logAiAction(userId, 'AI_DELETE_TASKS');
        const { find } = intent.payload;

        if (!find || Object.keys(find).length === 0) {
          return res.json({ response: "I'm sorry, I need to know *which* tasks you want to delete. Please provide some filters." });
        }

        let query;
        try {
          query = buildFilterQuery(find, userTeams);
        } catch (e) {
          return res.json({ response: `Sorry, I can't do that. ${e.message}` });
        }

        // **SECURITY**: Ensure all actions are scoped to the user's teams
        query.team = { $in: teamIds, ...(query.team ? { $eq: query.team } : {}) };

        // Perform the bulk delete
        const result = await Task.deleteMany(query);

        if (result.deletedCount === 0) {
          return res.json({ response: "I found 0 tasks that matched your criteria. No tasks were deleted." });
        }

        return res.json({ response: `Done. I've deleted ${result.deletedCount} task(s) that matched your criteria.` });
      }

      // --- *** NEW: ACTION: UPDATE A NOTE *** ---
      case 'UPDATE_NOTE': {
        logAiAction(userId, 'AI_UPDATE_NOTE');
        const { find, updates } = intent.payload;

        if (!find || !find.title) {
          return res.json({ response: "I'm sorry, I need to know which personal note you want to update. Please provide a title." });
        }

        // Build a query to find the note, scoped to the user
        const query = {
          title: { $regex: new RegExp(find.title, 'i') }, // Case-insensitive title search
          user: userId // **SECURITY**: Only find notes for this user
        };

        const note = await Note.findOne(query);

        if (!note) {
          return res.json({ response: `Sorry, I couldn't find a personal note matching "${find.title}".` });
        }

        // Apply the updates
        Object.assign(note, updates); // e.g., note.content = updates.content
        await note.save();

        return res.json({ response: `OK! I've updated your personal note: "${note.title}".` });
      }

      // --- *** NEW: ACTION: DELETE A NOTE *** ---
      case 'DELETE_NOTE': {
        logAiAction(userId, 'AI_DELETE_NOTE');
        const { find } = intent.payload;

        if (!find || !find.title) {
          return res.json({ response: "I'm sorry, I need to know which personal note you want to delete. Please provide a title." });
        }

        // Build a query to find the note, scoped to the user
        const query = {
          title: { $regex: new RegExp(find.title, 'i') },
          user: userId // **SECURITY**: Only find notes for this user
        };

        const note = await Note.findOne(query);

        if (!note) {
          return res.json({ response: `Sorry, I couldn't find a personal note matching "${find.title}".` });
        }

        // Delete the note
        await note.deleteOne();

        return res.json({ response: `Done. I've deleted the personal note "${note.title}".` });
      }

      case 'UPDATE_MEETING': {
        logAiAction(userId, 'AI_UPDATE_MEETING');
        const { find, updates } = intent.payload;

        if (!find || !find.title) {
          return res.json({ response: "I'm sorry, I need to know which meeting you want to update. Please provide a title." });
        }

        // Build a query to find the meeting
        const query = {
          title: { $regex: new RegExp(find.title, 'i') }, // Case-insensitive title search
          team: { $in: teamIds } // **SECURITY**: Only find meetings in this user's teams
        };

        const meeting = await Meeting.findOne(query);

        if (!meeting) {
          return res.json({ response: `Sorry, I couldn't find a meeting matching "${find.title}".` });
        }

        // --- Validation for new participants ---
        if (updates.participants) {
          const meetingTeam = userTeams.find(t => t._id.equals(meeting.team));
          for (const name of updates.participants) {
            if (!meetingTeam.members.includes(name)) {
              return res.json({ response: `Sorry, I can't update participants. The member "${name}" is not in the "${meetingTeam.teamName}" team.` });
            }
          }
        }

        // Apply the updates
        Object.assign(meeting, updates); // e.g., meeting.agenda = updates.agenda
        await meeting.save();

        return res.json({ response: `OK! I've updated the meeting: "${meeting.title}".` });
      }

      // --- *** NEW: ACTION: DELETE A MEETING *** ---
      case 'DELETE_MEETING': {
        logAiAction(userId, 'AI_DELETE_MEETING');
        const { find } = intent.payload;

        if (!find || !find.title) {
          return res.json({ response: "I'm sorry, I need to know which meeting you want to delete. Please provide a title." });
        }

        // --- NEW: Build a much more specific query ---
        const query = {
          title: { $regex: new RegExp(find.title, 'i') },
          team: { $in: teamIds } // **SECURITY**: Always scope to user's teams
        };

        // Add teamName filter if AI provided it
        if (find.teamName) {
          const team = userTeams.find(t => t.teamName.toLowerCase() === find.teamName.toLowerCase());
          if (!team) {
            return res.json({ response: `Sorry, I can't find a team named "${find.teamName}".` });
          }
          query.team = team._id; // Make the query much more specific
        }

        // Add meetingTime filter if AI provided it
        if (find.meetingTime) {
          // The AI provides a full UTC string. We can query it directly.
          query.meetingTime = new Date(find.meetingTime);
        }
        // --- End of new query logic ---

        const meeting = await Meeting.findOne(query);

        if (!meeting) {
          let errorMsg = `Sorry, I couldn't find a meeting matching "${find.title}"`;
          if (find.teamName) errorMsg += ` for the "${find.teamName}" team`;
          if (find.meetingTime) errorMsg += ` at that specific time.`;
          return res.json({ response: errorMsg });
        }

        // Delete the meeting
        await meeting.deleteOne();

        return res.json({ response: `Done. I've deleted the meeting "${meeting.title}".` });
      }

      case 'SET_ATTENDANCE': {
        const { teamName, members, status } = intent.payload;

        if (!status) {
          return res.json({ response: "I'm sorry, I need to know what status (Present, Absent, etc.) you'd like to set." });
        }

        let memberNames = [];

        if (teamName) {
          const team = userTeams.find(t => t.teamName.toLowerCase() === teamName.toLowerCase());
          if (!team) {
            return res.json({ response: `Sorry, I couldn't find a team named "${teamName}".` });
          }
          memberNames = team.members;
        } else if (members && members.length > 0) {
          // You could add validation here to ensure these members exist
          memberNames = members;
        } else {
          return res.json({ response: "I'm sorry, I need either a team name or a list of members to update attendance." });
        }

        if (memberNames.length === 0) {
          return res.json({ response: "I found 0 members to update." });
        }

        // Get today's date (start of day UTC)
        const targetDate = new Date();
        targetDate.setUTCHours(0, 0, 0, 0);

        // Build the bulk update operations
        const operations = memberNames.map(memberName => ({
          updateOne: {
            filter: {
              leader: userId,
              member: memberName,
              date: targetDate,
            },
            update: {
              $set: { status: status },
            },
            upsert: true, // Create a record if it doesn't exist
          },
        }));

        // Execute the bulk write
        const result = await Attendance.bulkWrite(operations);

        const count = result.upsertedCount + result.modifiedCount;
        return res.json({ response: `Done. I've marked ${count} members as "${status}" for today.` });
      }

      // --- ACTION: GET AN ANSWER (Read-Only) ---
      case 'GET_ANSWER':
      default: {
        logAiAction(userId, 'AI_GET_ANSWER');
        // This is the original "read-only" behavior
        const aiResponse = await generateChatResponse(history, question, dataContext);
        return res.json({ response: aiResponse });
      }
    }
  } catch (error) {
    console.error('AI chat error:', error);
    logError(userId, error, req.originalUrl);
    // Handle JSON parsing errors or other failures
    if (error.message.includes("JSON")) {
      return res.status(500).json({ message: "The AI returned an invalid response. Please try rephrasing." });
    }
    res.status(500).json({ message: 'Error processing your request', error: error.message });
  }
};
