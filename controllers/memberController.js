const Team = require('../models/Team');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const MemberProfile = require('../models/MemberProfile');

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
  const { name, joiningDate, endingDate } = req.body;

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
