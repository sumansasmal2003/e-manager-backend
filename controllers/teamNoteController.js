const TeamNote = require('../models/TeamNote');
const Team = require('../models/Team');
const { logError } = require('../services/logService');

// @desc    Get all notes for a team
// @route   GET /api/teamnotes/:teamId
exports.getTeamNotesForTeam = async (req, res) => {
  try {
    // Authorization is handled by the checkTeamMembership middleware
    const notes = await TeamNote.find({ team: req.params.teamId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username'); // Show who created it

    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Create a new note for a team
// @route   POST /api/teamnotes/:teamId
exports.createTeamNote = async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Please provide a title and content' });
    }

    const note = new TeamNote({
      team: req.params.teamId,
      createdBy: req.user.id,
      title,
      content,
    });

    const createdNote = await note.save();
    // Populate the 'createdBy' field before sending it back
    const populatedNote = await TeamNote.findById(createdNote._id)
      .populate('createdBy', 'username');

    res.status(201).json(populatedNote);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Update a team note
// @route   PUT /api/teamnotes/:noteId
exports.updateTeamNote = async (req, res) => {
  try {
    const { title, content } = req.body;
    const note = await TeamNote.findById(req.params.noteId);

    if (!note) {
      return res.status(404).json({ message: 'Team note not found' });
    }

    // Authorization is handled by checkTeamMembership middleware
    // We can just update
    note.title = title || note.title;
    note.content = content || note.content;

    const updatedNote = await note.save();
    const populatedNote = await TeamNote.findById(updatedNote._id)
      .populate('createdBy', 'username');

    logActivity(
  populatedNote.team,
  req.user.id,
  'NOTE_CREATED',
  `Created note '${populatedNote.title}'`
);
res.status(201).json(populatedNote);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a team note
// @route   DELETE /api/teamnotes/:noteId
exports.deleteTeamNote = async (req, res) => {
  try {
    const note = await TeamNote.findById(req.params.noteId);

    if (!note) {
      return res.status(404).json({ message: 'Team note not found' });
    }

    // Authorization is handled by checkTeamMembership middleware
    logActivity(
  note.team,
  req.user.id,
  'NOTE_DELETED',
  `Deleted note '${note.title}'`
);
await note.deleteOne();
    res.json({ message: 'Team note removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};
