const TeamNote = require('../models/TeamNote');
const Team = require('../models/Team');
const { logError } = require('../services/logService');
const { logActivity } = require('../services/activityService');

// @desc    Get all notes for a team
exports.getTeamNotesForTeam = async (req, res) => {
  try {
    // Authorization handled by checkTeamMembership middleware
    const notes = await TeamNote.find({ team: req.params.teamId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username');
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Create a new note
exports.createTeamNote = async (req, res) => {
  try {
    if (req.user.role === 'employee') return res.status(403).json({ message: 'Employees cannot create team notes.' });
    if (req.user.role === 'manager' && !req.user.permissions.canCreateNotes) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to create team notes.' });
    }

    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ message: 'Please provide a title and content' });

    const note = new TeamNote({
      team: req.params.teamId,
      createdBy: req.user.id,
      title,
      content,
    });

    const createdNote = await note.save();
    const populatedNote = await TeamNote.findById(createdNote._id).populate('createdBy', 'username');
    res.status(201).json(populatedNote);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Update a team note
exports.updateTeamNote = async (req, res) => {
  try {
    const { title, content } = req.body;
    const note = await TeamNote.findById(req.params.noteId);

    if (!note) return res.status(404).json({ message: 'Team note not found' });

    // --- FIX: Prevent Employees from Editing ---
    if (req.user.role === 'employee') {
        return res.status(403).json({ message: 'Employees cannot edit team notes.' });
    }

    note.title = title || note.title;
    note.content = content || note.content;

    const updatedNote = await note.save();
    const populatedNote = await TeamNote.findById(updatedNote._id).populate('createdBy', 'username');

    logActivity(populatedNote.team, req.user.id, 'NOTE_UPDATED', `Updated note '${populatedNote.title}'`);
    res.status(201).json(populatedNote);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a team note
exports.deleteTeamNote = async (req, res) => {
  try {
    const note = await TeamNote.findById(req.params.noteId);
    if (!note) return res.status(404).json({ message: 'Team note not found' });

    // --- Permission Checks ---
    if (req.user.role === 'employee') return res.status(403).json({ message: 'Employees cannot delete team notes.' });
    if (req.user.role === 'manager' && !req.user.permissions.canDeleteNotes) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to delete notes.' });
    }

    logActivity(note.team, req.user.id, 'NOTE_DELETED', `Deleted note '${note.title}'`);
    await note.deleteOne();
    res.json({ message: 'Team note removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};
