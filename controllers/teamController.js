const Team = require('../models/Team');
const User = require('../models/User');
const Task = require('../models/Task');       // <-- Import Task
const Meeting = require('../models/Meeting');

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

    res.status(201).json(populatedTeam);

  } catch (error) {
    // This catch block is what sends the 500 error
    console.error('Create Team Error:', error.message); // This will help us debug in the future
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

    // Send back the updated team
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
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
    // 3. Delete the team itself
    await team.deleteOne();

    res.json({ message: 'Team disbanded successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
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

    // Send back the updated team
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
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

    // Send back the updated team
    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
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

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
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

    const populatedTeam = await Team.findById(team._id)
      .populate('owner', 'username email');

    res.json(populatedTeam);

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
