// controllers/aiChatController.js
const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');
const MemberProfile = require('../models/MemberProfile');
const Attendance = require('../models/Attendance');
const TeamNote = require('../models/TeamNote');
const { generateChatResponse } = require('../services/reportService');

/**
 * @desc    Ask a question to the AI chatbot
 * @route   POST /api/chat/ask
 */
exports.askAiChatbot = async (req, res) => {
  const { history, question } = req.body; // history = array of {role, content}
  const userId = req.user.id;

  try {
    // 1. --- Aggregate All User Data ---
    // We fetch all data in parallel for speed.
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

    const [
      userTasks,
      userMeetings,
      userTeamNotes,
      userAttendance,
    ] = await Promise.all([
      Task.find({ team: { $in: teamIds } }).lean(),
      Meeting.find({ team: { $in: teamIds } }).lean(),
      TeamNote.find({ team: { $in: teamIds } }).lean(),
      Attendance.find({ leader: userId }).lean(),
    ]);

    // 2. --- Serialize Data into a Context String ---
    // This is a simple text serialization. JSON.stringify would also work
    // but text is sometimes easier for the AI to parse.
    let dataContext = "--- START OF USER'S ACCOUNT DATA ---\n\n";
    dataContext += `Today's Date: ${new Date().toLocaleDateString()}\n`;
    dataContext += `User's Name: ${req.user.username}\n\n`;

    dataContext += "## TEAMS ##\n";
    userTeams.forEach(team => {
      dataContext += `- ${team.teamName} (Members: ${team.members.join(', ') || 'None'})\n`;
    });

    dataContext += "\n## TASKS ##\n";
    userTasks.forEach(task => {
      dataContext += `- ${task.title} (Status: ${task.status}, Assigned: ${task.assignedTo}, Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A'})\n`;
    });

    dataContext += "\n## MEETINGS ##\n";
    userMeetings.forEach(meeting => {
      dataContext += `- ${meeting.title} (Time: ${new Date(meeting.meetingTime).toLocaleString()}, Participants: ${meeting.participants.join(', ')})\n`;
    });

    dataContext += "\n## MEMBER PROFILES ##\n";
    userMemberProfiles.forEach(profile => {
      dataContext += `- ${profile.name} (Email: ${profile.email || 'N/A'}, Joined: ${profile.joiningDate ? new Date(profile.joiningDate).toLocaleDateString() : 'N/A'})\n`;
    });

    dataContext += "\n## ATTENDANCE RECORDS (Sample) ##\n";
    // Give a sample of 20 records to avoid overwhelming the context
    userAttendance.slice(0, 20).forEach(att => {
      dataContext += `- ${att.member} was ${att.status} on ${new Date(att.date).toLocaleDateString()}\n`;
    });

    dataContext += "\n## PERSONAL NOTES (Titles) ##\n";
    userNotes.forEach(note => {
      dataContext += `- ${note.title} (Category: ${note.category})\n`;
    });

    dataContext += "\n## TEAM NOTES (Titles) ##\n";
    userTeamNotes.forEach(note => {
      dataContext += `- ${note.title}\n`;
    });

    dataContext += "\n--- END OF USER'S ACCOUNT DATA ---\n";

    // 3. --- Call the AI Service ---
    const aiResponse = await generateChatResponse(history, question, dataContext);

    // 4. --- Send Response to Frontend ---
    res.json({ response: aiResponse });

  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ message: 'Error processing your request', error: error.message });
  }
};
