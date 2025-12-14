const Team = require('../models/Team');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const OneOnOne = require('../models/OneOnOne');
const Activity = require('../models/Activity');
const MemberProfile = require('../models/MemberProfile');
const Attendance = require('../models/Attendance');
const User = require('../models/User'); // <-- Needed for Owner logic
const { generatePDFFromMarkdown } = require('../services/memberReportService');
const { generateAITalkingPoints, generateAIMemberReport } = require('../services/reportService');
const { sendMemberReportEmail, sendAccountStatusEmail } = require('../services/emailService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// --- HELPER: Get list of IDs the user can manage ---
// If Owner: Returns [OwnerID, Manager1ID, Manager2ID...]
// If Manager: Returns [ManagerID]
const getAllowedLeaderIds = async (user) => {
  if (user.role === 'owner') {
    const managers = await User.find({ ownerId: user.id }).distinct('_id');
    return [user.id, ...managers];
  }
  return [user.id];
};

// @desc    Get all unique members for the leader (and their managers)
// @route   GET /api/members
exports.getAllMembers = async (req, res) => {
  try {
    let teams;

    // 1. Fetch Teams based on Role
    if (req.user.role === 'employee') {
      // Employees see members of teams they belong to
      teams = await Team.find({
        $or: [
          { employees: req.user._id },
          { members: req.user.username }
        ]
      }).select('members teamName');
    } else {
      // Owners/Managers see members of teams they manage
      const allowedIds = await getAllowedLeaderIds(req.user);
      teams = await Team.find({ owner: { $in: allowedIds } }).select('members teamName');
    }

    // 2. Map Members to Teams
    const memberMap = new Map();

    teams.forEach(team => {
      team.members.forEach(member => {
        if (!memberMap.has(member)) {
          memberMap.set(member, []);
        }
        memberMap.get(member).push(team.teamName);
      });
    });

    const uniqueMembers = Array.from(memberMap, ([name, teams]) => ({
      name,
      teams
    }));

    // 3. Fetch User accounts for these members
    const memberNames = uniqueMembers.map(m => m.name);
    const users = await User.find({ username: { $in: memberNames } })
      .select('_id username role permissions isActive email');

    const userMap = new Map();
    users.forEach(u => userMap.set(u.username, u));

    // 4. Merge Data
    const mergedMembers = uniqueMembers.map(member => {
      const userAccount = userMap.get(member.name);
      return {
        ...member,
        userId: userAccount ? userAccount._id : null,
        role: userAccount ? userAccount.role : 'ghost',
        permissions: userAccount ? userAccount.permissions : null,
        isActive: userAccount ? userAccount.isActive : null,
        email: userAccount ? userAccount.email : null
      };
    });

    // 5. Filter out the requesting user from the list (Optional: Keeps list clean)
    // const finalMembers = mergedMembers.filter(m => m.name !== req.user.username);

    const sortedMembers = mergedMembers.sort((a, b) => a.name.localeCompare(b.name));

    res.json(sortedMembers);
  } catch (error) {
    console.error('Error in getAllMembers:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};

// --- NEW: Toggle Employee Status ---
// @route   PUT /api/members/:id/suspend
exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const targetUserId = req.params.id;

    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Only Owners can suspend employees.' });
    }

    const employee = await User.findOne({ _id: targetUserId, ownerId: req.user.id });

    if (!employee) {
      return res.status(404).json({ message: 'Employee account not found.' });
    }

    employee.isActive = !employee.isActive;
    await employee.save();

    // --- SEND EMAIL ---
    try {
      // If isActive is FALSE, it means they are NOW SUSPENDED (isSuspended = true)
      // If isActive is TRUE, it means they are NOW ACTIVE (isSuspended = false)
      const isSuspended = !employee.isActive;

      await sendAccountStatusEmail(
        employee.email,
        employee.username,
        req.user.companyName,
        isSuspended
      );
    } catch (emailErr) {
      console.error("Failed to send suspension email:", emailErr.message);
    }

    const statusMsg = employee.isActive ? 'activated' : 'suspended';
    res.json({
      message: `Employee ${employee.username} has been ${statusMsg}.`,
      isActive: employee.isActive
    });

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
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
    const allowedIds = await getAllowedLeaderIds(req.user);

    // 1. Find all teams in scope
    const userTeams = await Team.find({ owner: { $in: allowedIds } }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 2. Run queries (Tasks, Meetings, Activity) scoped to these teams
    const tasksQuery = Task.find({
      team: { $in: teamIds },
      assignedTo: name
    }).populate('team', 'teamName').sort({ dueDate: 1 });

    const meetingsQuery = Meeting.find({
      team: { $in: teamIds },
      participants: name
    }).populate('team', 'teamName').sort({ meetingTime: 1 });

    const activityQuery = Activity.find({
      team: { $in: teamIds },
      details: { $regex: new RegExp(name, 'i') }
    }).populate('user', 'username').sort({ createdAt: -1 }).limit(30);

    // 3. Find Profile (Scoped to allowed leaders)
    const profileQuery = MemberProfile.findOne({
      leader: { $in: allowedIds },
      name: name
    });

    const [tasks, meetings, activities, profile] = await Promise.all([
      tasksQuery,
      meetingsQuery,
      activityQuery,
      profileQuery
    ]);

    const memberProfile = profile || {
      name: name,
      joiningDate: null,
      endingDate: null,
      email: '',
    };

    res.json({ tasks, meetings, activities, profile: memberProfile });

  } catch (error) {
    console.error('Error in getMemberDetails:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Create or update a member's profile
// @route   PUT /api/members/profile
exports.updateMemberProfile = async (req, res) => {
  const { name, joiningDate, endingDate, email } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'Member name is required' });
  }

  try {
    const allowedIds = await getAllowedLeaderIds(req.user);

    // Check if a profile already exists under ANY allowed leader
    let profile = await MemberProfile.findOne({
      leader: { $in: allowedIds },
      name: name
    });

    if (profile) {
      // Update existing
      profile.joiningDate = joiningDate || null;
      profile.endingDate = endingDate || null;
      profile.email = email || '';
      await profile.save();
    } else {
      // Create new (assign to current user)
      profile = await MemberProfile.create({
        leader: req.user.id,
        name,
        joiningDate: joiningDate || null,
        endingDate: endingDate || null,
        email: email || ''
      });
    }

    res.json(profile);
  } catch (error) {
    console.error('Error in updateMemberProfile:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Generate and email a report for a specific member
// @route   POST /api/members/send-report
exports.sendMemberReport = async (req, res) => {
  const { memberName } = req.body;
  const leaderId = req.user.id;

  try {
    if (req.user.role === 'manager' && !req.user.permissions.canExportReports) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to generate/export reports.' });
    }
    const allowedIds = await getAllowedLeaderIds(req.user);

    // 1. Find profile in scope
    const profile = await MemberProfile.findOne({
      leader: { $in: allowedIds },
      name: memberName,
    });

    if (!profile) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }
    if (!profile.email) {
      return res.status(400).json({ message: 'Member does not have an email on file.' });
    }

    // 2. Get all teams in scope
    const teams = await Team.find({ owner: { $in: allowedIds } }).select('_id');
    const teamIds = teams.map(t => t._id);

    // 3. Date Range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);

    // 4. Fetch Data
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
        leader: { $in: allowedIds }, // Fetch attendance marked by any manager
        member: memberName,
        date: { $gte: startDate, $lte: endDate }
      }),
    ]);

    const markdownReport = await generateAIMemberReport(
      profile,
      tasks,
      attendance,
      startDate,
      endDate
    );

    const pdfBuffer = await generatePDFFromMarkdown(markdownReport, profile.name);

    await sendMemberReportEmail(profile.email, profile.name, pdfBuffer, leaderId);

    logAiAction(req.user.id, 'AI_MEMBER_REPORT');

    res.json({ message: `AI-powered report successfully sent to ${profile.email}.` });

  } catch (error) {
    console.error('Send Member Report Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Generate AI talking points for a 1-on-1
// @route   GET /api/members/talking-points?name=...
exports.generateTalkingPoints = async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ message: 'Member name is required' });
  }

  try {
    const allowedIds = await getAllowedLeaderIds(req.user);
    const userTeams = await Team.find({ owner: { $in: allowedIds } }).select('_id');
    const teamIds = userTeams.map(team => team._id);

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
        leader: { $in: allowedIds },
        name: name
      })
    ]);

    if (!profile) {
      return res.status(404).json({ message: 'Member profile not found.' });
    }

    const talkingPoints = await generateAITalkingPoints(profile, tasks, activities);

    logAiAction(req.user.id, 'AI_TALKING_POINTS');
    res.json({ talkingPoints });

  } catch (error) {
    console.error('Error in generateTalkingPoints:', error.message);
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

exports.deleteMember = async (req, res) => {
  const { name } = req.params;
  const user = req.user;

  // 1. Authorization: Only Owner can delete members globally
  if (user.role !== 'owner') {
    return res.status(403).json({ message: 'Restricted: Only the Organization Owner can delete members.' });
  }

  try {
    const allowedIds = await getAllowedLeaderIds(user);

    // 2. Find all teams this owner/manager hierarchy controls
    const teams = await Team.find({ owner: { $in: allowedIds } }).select('_id');
    const teamIds = teams.map(t => t._id);

    // 3. Perform Cascading Delete
    await Promise.all([
      // Remove name from all Team member arrays
      Team.updateMany(
        { owner: { $in: allowedIds } },
        { $pull: { members: name } }
      ),
      // Delete Tasks assigned to this member
      Task.deleteMany({ team: { $in: teamIds }, assignedTo: name }),
      // Remove from Meetings
      Meeting.updateMany(
        { team: { $in: teamIds } },
        { $pull: { participants: name } }
      ),
      // Delete Profile
      MemberProfile.deleteOne({ leader: { $in: allowedIds }, name: name }),
      // Delete Attendance
      Attendance.deleteMany({ leader: { $in: allowedIds }, member: name }),
      // Delete 1-on-1s
      OneOnOne.deleteMany({ leader: { $in: allowedIds }, memberName: name })
    ]);

    res.json({ message: `Member '${name}' has been permanently removed from the organization.` });

  } catch (error) {
    console.error('Delete Member Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
