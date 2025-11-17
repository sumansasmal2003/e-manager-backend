const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const TeamNote = require('../models/TeamNote');
const MemberProfile = require('../models/MemberProfile');
const { logError } = require('../services/logService');

/**
 * @desc    Perform a global search across all models
 * @route   GET /api/search?q=...
 */
exports.globalSearch = async (req, res) => {
  try {
    const { q } = req.query;

    // If no query, return empty arrays
    if (!q) {
      return res.json({ teams: [], tasks: [], notes: [], teamNotes: [], members: [] });
    }

    const query = { $regex: q, $options: 'i' };
    const userId = req.user.id;

    // 1. Get user's team IDs to scope task/teamNote searches
    const userTeams = await Team.find({ owner: userId }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 2. Run all searches in parallel
    const [teams, tasks, notes, teamNotes, members] = await Promise.all([
      // Search Teams owned by user
      Team.find({ owner: userId, teamName: query })
        .limit(5)
        .select('teamName'),

      // Search Tasks in user's teams
      Task.find({ team: { $in: teamIds }, title: query })
        .limit(5)
        .select('title status team')
        .populate('team', 'teamName'),

      // Search Personal Notes
      Note.find({ user: userId, title: query })
        .limit(5)
        .select('title category'),

      // Search Team Notes in user's teams
      TeamNote.find({ team: { $in: teamIds }, title: query })
        .limit(5)
        .select('title team')
        .populate('team', 'teamName'),

      // Search Members (via MemberProfile)
      MemberProfile.find({ leader: userId, name: query })
        .limit(5)
        .select('name joiningDate')
    ]);

    // 3. Return aggregated results
    res.json({ teams, tasks, notes, teamNotes, members });

  } catch (error) {
    console.error('Global search error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};
