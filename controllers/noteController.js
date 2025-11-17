const Note = require('../models/Note');
const { logError } = require('../services/logService');

// @desc    Get all notes for the logged-in user
// @route   GET /api/notes
exports.getMyNotes = async (req, res) => {
  try {
    // req.user.id comes from the 'protect' middleware
    const notes = await Note.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Create a new note
// @route   POST /api/notes
exports.createNote = async (req, res) => {
  try {
    const { title, content, planPeriod, category } = req.body;

    const note = new Note({
      user: req.user.id, // Attach the logged-in user's ID
      title,
      content,
      planPeriod,
      category,
    });

    const createdNote = await note.save();
    res.status(201).json(createdNote);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Update a note
// @route   PUT /api/notes/:id
exports.updateNote = async (req, res) => {
  try {
    const { title, content, planPeriod, category } = req.body;
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Check if the note belongs to the user
    if (note.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Update the fields
    note.title = title || note.title;
    note.content = content || note.content;
    note.planPeriod = planPeriod || note.planPeriod;
    note.category = category || note.category;

    const updatedNote = await note.save();
    res.json(updatedNote);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a note
// @route   DELETE /api/notes/:id
exports.deleteNote = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Check if the note belongs to the user
    if (note.user.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await note.deleteOne(); // Use deleteOne()
    res.json({ message: 'Note removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};
