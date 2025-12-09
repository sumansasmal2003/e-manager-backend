const Team = require('../models/Team');
const User = require('../models/User');
const Task = require('../models/Task');
const Meeting = require('../models/Meeting');
const TeamNote = require('../models/TeamNote');
const Activity = require('../models/Activity');
const { logActivity } = require('../services/activityService');
const { generateAIReport } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// --- HELPER: Check if User has access to this Team ---
const hasTeamAccess = async (team, user) => {
  // 1. If user is the direct owner of the team
  if (team.owner._id.toString() === user.id) {
    return true;
  }

  // 2. If user is an 'owner' (Super Admin) and the team belongs to one of their managers
  if (user.role === 'owner') {
    // We need to fetch the team owner's profile to check their ownerId
    // (In many cases, team.owner might be populated, so check that first)
    let teamOwner = team.owner;

    // If team.owner is just an ID (not populated object), fetch the user
    if (!teamOwner.ownerId && !teamOwner.role) {
       teamOwner = await User.findById(team.owner);
    }

    // Check if the team owner reports to this user (the Owner)
    if (teamOwner && teamOwner.ownerId && teamOwner.ownerId.toString() === user.id) {
      return true;
    }
  }

  return false;
};

// @desc    Create a new team
// @route   POST /api/teams
exports.createTeam = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Restricted: Only the Organization Owner can create teams.' });
    }
    const { teamName } = req.body;
    if (!teamName) {
      return res.status(400).json({ message: 'Please provide a team name' });
    }

    const team = new Team({
      teamName,
      owner: req.user.id,
      members: [],
    });

    const createdTeam = await team.save();

    const populatedTeam = await Team.findById(createdTeam._id)
      .populate('owner', 'username email');

    logActivity(
      populatedTeam._id,
      req.user.id,
      'TEAM_CREATED',
      `Team '${populatedTeam.teamName}' was created`
    );
    res.status(201).json(populatedTeam);

  } catch (error) {
    console.error('Create Team Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get all teams (Owner sees ALL, Manager sees THEIRS)
// @route   GET /api/teams
exports.getMyTeams = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'owner') {
      // 1. Find all managers reporting to this owner
      const managers = await User.find({ ownerId: req.user.id }).distinct('_id');

      // 2. Include the owner's own ID + all manager IDs
      const allAllowedIds = [req.user.id, ...managers];

      query = { owner: { $in: allAllowedIds } };
    } else {
      // Manager: only see their own teams
      query = { owner: req.user.id };
    }

    const teams = await Team.find(query)
      .populate('owner', 'username email')
      .sort({ createdAt: -1 });

    res.json(teams);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Add a member (string name) to a team
// @route   PUT /api/teams/:id/add
exports.addTeamMember = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Restricted: Only the Organization Owner can add members.' });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Please provide a name' });
    }

    const team = await Team.findById(req.params.id).populate('owner');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    if (team.members.includes(name)) {
      return res.status(400).json({ message: 'This member name already exists in the team' });
    }

    team.members.push(name);
    await team.save();

    logActivity(
      team._id,
      req.user.id,
      'MEMBER_ADDED',
      `Added member '${name}' to the team`
    );

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Get team details by ID
exports.getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('owner', 'username email role ownerId');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    res.json(team);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a team
// @route   DELETE /api/teams/:id
exports.deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id).populate('owner');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    await Task.deleteMany({ team: team._id });
    await Meeting.deleteMany({ team: team._id });
    await TeamNote.deleteMany({ team: team._id });
    await Activity.deleteMany({ team: team._id });
    await team.deleteOne();

    res.json({ message: 'Team disbanded successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Add a Figma file link to a team
// @route   POST /api/teams/:id/figma
exports.addFigmaLink = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canCreateResources) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to add resources.' });
    }
    const { name, link } = req.body;

    if (!name || !link) {
      return res.status(400).json({ message: 'Please provide a name and a link' });
    }

    const team = await Team.findById(req.params.id).populate('owner');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    team.figmaFiles.push({ name, link });
    await team.save();

    logActivity(
      team._id,
      req.user.id,
      'FIGMA_LINK_ADDED',
      `Added Figma link: '${name}'`
    );

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a Figma file link from a team
// @route   DELETE /api/teams/:id/figma/:linkId
exports.deleteFigmaLink = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canDeleteResources) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to delete resources.' });
    }
    const { linkId } = req.params;
    const team = await Team.findById(req.params.id).populate('owner');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const fileLink = team.figmaFiles.id(linkId);
    if (!fileLink) {
      return res.status(404).json({ message: 'File link not found' });
    }

    const linkName = fileLink.name;
    fileLink.deleteOne();
    await team.save();

    logActivity(
      team._id,
      req.user.id,
      'FIGMA_LINK_DELETED',
      `Removed Figma link: '${linkName}'`
    );

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Add a GitHub repo link to a team
// @route   POST /api/teams/:id/github
exports.addGithubRepo = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canCreateResources) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to add resources.' });
    }
    const { name, link } = req.body;

    if (!name || !link) {
      return res.status(400).json({ message: 'Please provide a name and a link' });
    }

    const team = await Team.findById(req.params.id).populate('owner');
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    team.githubRepos.push({ name, link });
    await team.save();

    logActivity(
      team._id,
      req.user.id,
      'GITHUB_REPO_ADDED',
      `Added GitHub Repo: '${name}'`
    );

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a GitHub repo link from a team
// @route   DELETE /api/teams/:id/github/:repoId
exports.deleteGithubRepo = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canDeleteResources) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to delete resources.' });
    }
    const { repoId } = req.params;
    const team = await Team.findById(req.params.id).populate('owner');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const repoLink = team.githubRepos.id(repoId);
    if (!repoLink) {
      return res.status(404).json({ message: 'Repo link not found' });
    }

    const repoName = repoLink.name;
    repoLink.deleteOne();
    await team.save();

    logActivity(
      team._id,
      req.user.id,
      'GITHUB_REPO_DELETED',
      `Removed GitHub Repo: '${repoName}'`
    );

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Remove a member (string name) from a team
// @route   PUT /api/teams/:id/remove
exports.removeTeamMember = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Please provide a member name' });
    }

    const team = await Team.findById(req.params.id).populate('owner');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized, only owner can remove members' });
    }

    const memberIndex = team.members.indexOf(name);
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in this team' });
    }

    // --- Start Cascade Operations ---
    const taskDeletion = Task.deleteMany({ team: team._id, assignedTo: name });
    const meetingUpdate = Meeting.updateMany(
      { team: team._id },
      { $pull: { participants: name } }
    );

    await Promise.all([taskDeletion, meetingUpdate]);

    logActivity(
      team._id,
      req.user.id,
      'MEMBER_REMOVED',
      `Removed member '${name}' from the team`
    );
    // --- End Cascade Operations ---

    team.members.pull(name);
    await team.save();

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Generate a team report
// @route   POST /api/teams/:id/generate-report
exports.generateTeamReport = async (req, res) => {
  const { startDate, endDate, leaderName } = req.body;
  const { id: teamId } = req.params;

  if (!startDate || !endDate || !leaderName) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const team = await Team.findById(teamId).populate('owner');
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check (Report generation reads data, so we check access)
    if (!(await hasTeamAccess(team, req.user))) {
        return res.status(401).json({ message: 'Not authorized to generate report for this team' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const tasksCreatedQuery = Task.find({
      team: teamId,
      createdAt: { $gte: start, $lte: end }
    }).select('title assignedTo');

    const tasksCompletedQuery = Task.find({
      team: teamId,
      status: 'Completed',
      updatedAt: { $gte: start, $lte: end }
    }).select('title assignedTo');

    const tasksOverdueQuery = Task.find({
      team: teamId,
      dueDate: { $lt: new Date() },
      status: { $ne: 'Completed' },
      createdAt: { $lte: end }
    });

    const meetingsHeldQuery = Meeting.find({
      team: teamId,
      meetingTime: { $gte: start, $lte: end }
    });

    const [tasksCreated, tasksCompleted, tasksOverdue, meetingsHeld] = await Promise.all([
      tasksCreatedQuery,
      tasksCompletedQuery,
      tasksOverdueQuery,
      meetingsHeldQuery
    ]);

    const memberActivity = {};

    const ensureMember = (name) => {
      const memberName = name || 'Unassigned';
      if (!memberActivity[memberName]) {
        memberActivity[memberName] = { completedTasks: [], newTasks: [] };
      }
      return memberName;
    };

    tasksCreated.forEach(task => {
      const memberName = ensureMember(task.assignedTo);
      memberActivity[memberName].newTasks.push(task.title);
    });

    tasksCompleted.forEach(task => {
      const memberName = ensureMember(task.assignedTo);
      memberActivity[memberName].completedTasks.push(task.title);
    });

    const processedData = {
      tasksCreatedCount: tasksCreated.length,
      tasksCompletedCount: tasksCompleted.length,
      tasksOverdueCount: tasksOverdue.length,
      meetingsHeldCount: meetingsHeld.length,
      memberActivity: memberActivity
    };

    const reportText = await generateAIReport(leaderName, team, startDate, endDate, processedData);
    logAiAction(req.user.id, 'AI_TEAM_REPORT');
    res.json({ report: reportText });

  } catch (error) {
    console.error('Report generation error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Add a Live Project link to a team
// @route   POST /api/teams/:id/liveproject
exports.addLiveProject = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canCreateResources) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to add resources.' });
    }
    const { name, link } = req.body;

    if (!name || !link) {
      return res.status(400).json({ message: 'Please provide a name and a link' });
    }

    const team = await Team.findById(req.params.id).populate('owner');
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    team.liveProjects.push({ name, link });
    await team.save();

    logActivity(
      team._id,
      req.user.id,
      'LIVE_LINK_ADDED',
      `Added Live Project: '${name}'`
    );

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a Live Project link from a team
// @route   DELETE /api/teams/:id/liveproject/:linkId
exports.deleteLiveProject = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canDeleteResources) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to delete resources.' });
    }
    const { linkId } = req.params;
    const team = await Team.findById(req.params.id).populate('owner');

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Authorization Check
    if (!(await hasTeamAccess(team, req.user))) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const projectLink = team.liveProjects.id(linkId);
    if (!projectLink) {
      return res.status(404).json({ message: 'Project link not found' });
    }

    const linkName = projectLink.name;
    logActivity(
      team._id,
      req.user.id,
      'LIVE_LINK_DELETED',
      `Removed Live Project: '${linkName}'`
    );

    projectLink.deleteOne();
    await team.save();

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};
