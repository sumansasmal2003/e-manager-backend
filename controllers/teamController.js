const Team = require('../models/Team');
const User = require('../models/User');
const Task = require('../models/Task');       // <-- Import Task
const Meeting = require('../models/Meeting');
const TeamNote = require('../models/TeamNote');
const Activity = require('../models/Activity');
const { logActivity } = require('../services/activityService');
const { generateAIReport } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// @desc    Create a new team
// @route   POST /api/teams
exports.createTeam = async (req, res) => {
  try {
    const { teamName } = req.body;
    if (!teamName) {
      return res.status(400).json({ message: 'Please provide a team name' });
    }

    const team = new Team({
      teamName,
      owner: req.user.id,
      members: [], // Starts empty
    });

    const createdTeam = await team.save();

    // The old, buggy code that tried to access 'user.teams' is now gone.

    // Populate owner info before sending back
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
    // This catch block is what sends the 500 error
    console.error('Create Team Error:', error.message); // This will help us debug in the future
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get all teams for the logged-in user
exports.getMyTeams = async (req, res) => {
  try {
    // Find all teams created by this user
    const teams = await Team.find({ owner: req.user.id }) // <-- CHANGED
      .populate('owner', 'username email')
      // No longer need to populate members
      .sort({ createdAt: -1 });

    res.json(teams);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Add a member (string name) to a team
// @route   PUT /api/teams/:id/add
exports.addTeamMember = async (req, res) => {
  try {
    const { name } = req.body; // <-- CHANGED: We expect a 'name'
    if (!name) {
      return res.status(400).json({ message: 'Please provide a name' });
    }

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if the logged-in user is the owner
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized, only owner can add members' });
    }

    // Check if name is already in the team
    if (team.members.includes(name)) {
      return res.status(400).json({ message: 'This member name already exists in the team' });
    }

    // Add the name (string) to the array
    team.members.push(name);
    await team.save();

    logActivity(
  team._id,
  req.user.id,
  'MEMBER_ADDED',
  `Added member '${name}' to the team`
);

    // Send back the updated team
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Get team details by ID
exports.getTeamById = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id)
      .populate('owner', 'username email');
      // No longer need to populate members

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if the logged-in user is the owner
    // This is the line we fixed:
    if (team.owner._id.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    res.json(team);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a team
// @route   DELETE /api/teams/:id
exports.deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if the logged-in user is the owner
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized, only owner can delete' });
    }

    // --- Cascading Delete ---
    // 1. Delete all tasks for this team
    await Task.deleteMany({ team: team._id });
    // 2. Delete all meetings for this team
    await Meeting.deleteMany({ team: team._id });
    // 3. Delete all team notes for this team
    await TeamNote.deleteMany({ team: team._id });
    await Activity.deleteMany({ team: team._id });
    // 4. Delete the team itself
    await team.deleteOne();

    res.json({ message: 'Team disbanded successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Add a Figma file link to a team
// @route   POST /api/teams/:id/figma
exports.addFigmaLink = async (req, res) => {
  try {
    const { name, link } = req.body;

    if (!name || !link) {
      return res.status(400).json({ message: 'Please provide a name and a link' });
    }

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if the logged-in user is the owner
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Add the new file link
    team.figmaFiles.push({ name, link });
    await team.save();

    logActivity(
  team._id,
  req.user.id,
  'FIGMA_LINK_ADDED',
  `Added Figma link: '${name}'`
);

    // Send back the updated team
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a Figma file link from a team
// @route   DELETE /api/teams/:id/figma/:linkId
exports.deleteFigmaLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if the logged-in user is the owner
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Find the link
    const fileLink = team.figmaFiles.id(linkId);
    if (!fileLink) {
      return res.status(404).json({ message: 'File link not found' });
    }

    // Remove it from the array
    fileLink.deleteOne();
    await team.save();

    logActivity(
  team._id,
  req.user.id,
  'FIGMA_LINK_DELETED',
  `Removed Figma link: '${name}'`
);

    // Send back the updated team
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Add a GitHub repo link to a team
// @route   POST /api/teams/:id/github
exports.addGithubRepo = async (req, res) => {
  try {
    const { name, link } = req.body;

    if (!name || !link) {
      return res.status(400).json({ message: 'Please provide a name and a link' });
    }

    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    if (team.owner.toString() !== req.user.id) {
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
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a GitHub repo link from a team
// @route   DELETE /api/teams/:id/github/:repoId
exports.deleteGithubRepo = async (req, res) => {
  try {
    const { repoId } = req.params;
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const repoLink = team.githubRepos.id(repoId);
    if (!repoLink) {
      return res.status(404).json({ message: 'Repo link not found' });
    }

    repoLink.deleteOne();
    await team.save();

    logActivity(
  team._id,
  req.user.id,
  'GITHUB_REPO_DELETED',
  `Removed GitHub Repo: '${name}'`
);

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Remove a member (string name) from a team
// @route   PUT /api/teams/:id/remove
exports.removeTeamMember = async (req, res) => {
  try {
    const { name } = req.body; // Get the name of the member to remove
    if (!name) {
      return res.status(400).json({ message: 'Please provide a member name' });
    }

    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if the logged-in user is the owner
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized, only owner can remove members' });
    }

    // Check if the member exists in the team
    const memberIndex = team.members.indexOf(name);
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in this team' });
    }

    // --- Start Cascade Operations ---
    // We must clean up tasks and meetings before removing the member

    // 1. Delete all tasks assigned to this member in this team
    const taskDeletion = Task.deleteMany({ team: team._id, assignedTo: name });

    // 2. Remove this member from all meeting participant lists for this team
    const meetingUpdate = Meeting.updateMany(
      { team: team._id },
      { $pull: { participants: name } }
    );

    // Run operations in parallel
    await Promise.all([taskDeletion, meetingUpdate]);

    logActivity(
  team._id,
  req.user.id,
  'MEMBER_REMOVED',
  `Removed member '${name}' from the team`
);

    // --- End Cascade Operations ---

    // Now, remove the member from the team's array
    team.members.pull(name); // .pull() is a Mongoose helper for removing from array
    await team.save();

    // Send back the updated team
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
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
    const team = await Team.findById(teamId); //
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // --- We are fetching the same data as before ---
    const tasksCreatedQuery = Task.find({ //
      team: teamId,
      createdAt: { $gte: start, $lte: end }
    }).select('title assignedTo'); // Get title and assignee

    const tasksCompletedQuery = Task.find({ //
      team: teamId,
      status: 'Completed',
      updatedAt: { $gte: start, $lte: end } // Use updatedAt to see when it was completed
    }).select('title assignedTo'); // Get title and assignee

    const tasksOverdueQuery = Task.find({ //
      team: teamId,
      dueDate: { $lt: new Date() },
      status: { $ne: 'Completed' },
      createdAt: { $lte: end }
    });

    const meetingsHeldQuery = Meeting.find({ //
      team: teamId,
      meetingTime: { $gte: start, $lte: end }
    });

    const [tasksCreated, tasksCompleted, tasksOverdue, meetingsHeld] = await Promise.all([
      tasksCreatedQuery,
      tasksCompletedQuery,
      tasksOverdueQuery,
      meetingsHeldQuery
    ]);

    // --- Process data to be member-wise with full task lists ---
    const memberActivity = {};

    // Helper to ensure member is initialized
    const ensureMember = (name) => {
      // Handle cases where assignee might be null or undefined
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

    // --- Create the final processed data object ---
    const processedData = {
      tasksCreatedCount: tasksCreated.length,
      tasksCompletedCount: tasksCompleted.length,
      tasksOverdueCount: tasksOverdue.length,
      meetingsHeldCount: meetingsHeld.length,
      memberActivity: memberActivity // This now contains full lists of task titles
    };

    // 3. Call the AI Service with the new data structure
    const reportText = await generateAIReport(leaderName, team, startDate, endDate, processedData);
    logAiAction(req.user.id, 'AI_TEAM_REPORT');
    res.json({ report: reportText });

  } catch (error) {
    console.error('Report generation error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Add a Live Project link to a team
// @route   POST /api/teams/:id/liveproject
exports.addLiveProject = async (req, res) => {
  try {
    const { name, link } = req.body;

    if (!name || !link) {
      return res.status(400).json({ message: 'Please provide a name and a link' });
    }

    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    team.liveProjects.push({ name, link }); // <-- Use liveProjects array
    await team.save();

    logActivity(
      team._id,
      req.user.id,
      'LIVE_LINK_ADDED', // <-- Use new activity type
      `Added Live Project: '${name}'`
    );

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a Live Project link from a team
// @route   DELETE /api/teams/:id/liveproject/:linkId
exports.deleteLiveProject = async (req, res) => {
  try {
    const { linkId } = req.params; // <-- Use 'linkId'
    const team = await Team.findById(req.params.id);

    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const projectLink = team.liveProjects.id(linkId); // <-- Find in liveProjects
    if (!projectLink) {
      return res.status(404).json({ message: 'Project link not found' });
    }

    logActivity(
      team._id,
      req.user.id,
      'LIVE_LINK_DELETED', // <-- Use new activity type
      `Removed Live Project: '${projectLink.name}'`
    );

    projectLink.deleteOne();
    await team.save();

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};
