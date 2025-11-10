const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    // This connects the note to a specific user
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User', // Establishes a relationship with the User model
    },
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'Please add content'],
    },
    // This is for the "1 week, 1 month, 1 year" feature
    planPeriod: {
      type: String,
      required: false, // Make it optional for now
      default: 'General',
    },
    category: {
      type: String,
      default: 'Personal',
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

const Note = mongoose.model('Note', noteSchema);
module.exports = Note;
