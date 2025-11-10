const mongoose = require('mongoose');

const teamNoteSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Team',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
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
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

const TeamNote = mongoose.model('TeamNote', teamNoteSchema);
module.exports = TeamNote;
