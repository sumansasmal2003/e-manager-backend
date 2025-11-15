const Team = require('../models/Team');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const MemberProfile = require('../models/MemberProfile');
const Attendance = require('../models/Attendance');
const { generatePDFFromMarkdown } = require('../services/memberReportService');
const { generateAITalkingPoints } = require('../services/reportService');
const { generateAIMemberReport } = require('../services/reportService');
const { sendMemberReportEmail } = require('../services/emailService');

// @desc    Get all unique members for the leader with their teams
// @route   GET /api/members
exports.getAllMembers = async (req, res) => {
  try {
    // We need to select both 'members' and 'teamName'
    const teams = await Team.find({ owner: req.user.id }).select('members teamName');

    // Use a Map to store { memberName: [teamName1, teamName2] }
    const memberMap = new Map();

    teams.forEach(team => {
      team.members.forEach(member => {
        if (!memberMap.has(member)) {
          // If this is the first time we see this member, create an empty array
          memberMap.set(member, []);
        }
        // Add the current team name to this member's list
        memberMap.get(member).push(team.teamName);
      });
    });

    // Convert the Map into an array of objects: [{ name: 'Suman', teams: ['Team A'] }]
    const uniqueMembers = Array.from(memberMap, ([name, teams]) => ({
      name,
      teams
    }));

    // Sort by name
    const sortedMembers = uniqueMembers.sort((a, b) => a.name.localeCompare(b.name));

    res.json(sortedMembers);
  } catch (error) {
    console.error('Error in getAllMembers:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all details for a specific member
// @route   GET /api/members/details?name=...
exports.getMemberDetails = async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ message: 'Member name is required' });
  }

  try {
    const userTeams = await Team.find({ owner: req.user.id }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 1. Find all tasks for this member
    const tasksQuery = Task.find({
      team: { $in: teamIds },
      assignedTo: name
    }).populate('team', 'teamName').sort({ dueDate: 1 });

    // 2. Find all meetings this member is a part of
    const meetingsQuery = Meeting.find({
      team: { $in: teamIds },
      participants: name
    }).populate('team', 'teamName').sort({ meetingTime: 1 });

    // 3. Find all activity logs that mention this member
    const activityQuery = Activity.find({
      team: { $in: teamIds },
      details: { $regex: new RegExp(name, 'i') }
    }).populate('user', 'username').sort({ createdAt: -1 }).limit(30);

    // 4. Find or create the member's profile
    // We use "find" and if it doesn't exist, we send a default
    const profileQuery = MemberProfile.findOne({
      leader: req.user.id,
      name: name
    });

    // 5. Run all queries in parallel
    const [tasks, meetings, activities, profile] = await Promise.all([
      tasksQuery,
      meetingsQuery,
      activityQuery,
      profileQuery
    ]);

    // If no profile exists, send a default one
    const memberProfile = profile || {
      name: name,
      joiningDate: null,
      endingDate: null,
      email: '',
    };

    res.json({ tasks, meetings, activities, profile: memberProfile }); // <-- 5. ADD PROFILE

  } catch (error) {
    console.error('Error in getMemberDetails:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

// --- 3. ADD THIS NEW FUNCTION ---
// @desc    Create or update a member's profile
// @route   PUT /api/members/profile
exports.updateMemberProfile = async (req, res) => {
  const { name, joiningDate, endingDate, email } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Member name is required' });
  }

  try {
    // Find the profile by leader ID and name, and update it.
    // If it doesn't exist, 'upsert: true' will create it.
    const updatedProfile = await MemberProfile.findOneAndUpdate(
      { leader: req.user.id, name: name },
      {
        $set: {
          joiningDate: joiningDate || null,
          endingDate: endingDate || null,
          email: email || '',
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.json(updatedProfile);
  } catch (error) {
    console.error('Error in updateMemberProfile:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Generate and email a report for a specific member
 * @route   POST /api/members/send-report
 */
exports.sendMemberReport = async (req, res) => {
  const { memberName } = req.body;
  const leaderId = req.user.id;

  try {
    // 1. Find profile (remains the same)
    const profile = await MemberProfile.findOne({
      leader: leaderId,
      name: memberName,
    });

    if (!profile) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }
    if (!profile.email) {
      return res.status(400).json({ message: 'Member does not have an email on file. Please add one first.' });
    }

    // 2. Get all teams (remains the same)
    const teams = await Team.find({ owner: leaderId }).select('_id');
    const teamIds = teams.map(t => t._id);

    // 3. DEFINE DATE RANGE (remains the same)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30); // 30 days ago

    // 4. Fetch all data for this member (remains the same)
    const [tasks, attendance] = await Promise.all([
      Task.find({
        team: { $in: teamIds },
        assignedTo: memberName,
        $or: [
          { status: { $in: ['Pending', 'In Progress'] } },
          { updatedAt: { $gte: startDate, $lte: endDate }, status: 'Completed' }
        ]
      }),
      Attendance.find({
        leader: leaderId,
        member: memberName,
        date: { $gte: startDate, $lte: endDate }
      }),
    ]);

    // --- 5. THIS IS THE NEW LOGIC ---
    // 5a. Generate the report summary text using AI
    const markdownReport = await generateAIMemberReport(
      profile,
      tasks,
      attendance,
      startDate,
      endDate
    );

    // 5b. Convert that markdown text into a PDF buffer
    const pdfBuffer = await generatePDFFromMarkdown(markdownReport, profile.name);
    // --- END OF NEW LOGIC ---

    // 6. Send the email (remains the same)
    await sendMemberReportEmail(profile.email, profile.name, pdfBuffer, leaderId);

    res.json({ message: `AI-powered report successfully sent to ${profile.email}.` });

  } catch (error) {
    console.error('Send Member Report Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * @desc    Generate AI talking points for a 1-on-1
 * @route   GET /api/members/talking-points?name=...
 */
exports.generateTalkingPoints = async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ message: 'Member name is required' });
  }

  try {
    const userTeams = await Team.find({ owner: req.user.id }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 1. Fetch the same data as getMemberDetails
    const [tasks, activities, profile] = await Promise.all([
      Task.find({
        team: { $in: teamIds },
        assignedTo: name
      }).sort({ dueDate: 1 }),

      Activity.find({
        team: { $in: teamIds },
        details: { $regex: new RegExp(name, 'i') }
      }).populate('user', 'username').sort({ createdAt: -1 }).limit(30),

      MemberProfile.findOne({
        leader: req.user.id,
        name: name
      })
    ]);

    if (!profile) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    // 2. Call the new AI service
    const talkingPoints = await generateAITalkingPoints(profile, tasks, activities);

    // 3. Send the result back
    res.json({ talkingPoints });

  } catch (error) {
    console.error('Error in generateTalkingPoints:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};
