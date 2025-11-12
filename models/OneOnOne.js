// models/OneOnOne.js

const mongoose = require('mongoose');

const actionItemSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
});

const oneOnOneSchema = new mongoose.Schema(
  {
    // The leader who is holding this 1-on-1
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // The member's name (the string)
    memberName: {
      type: String,
      required: true,
      trim: true,
    },
    // The date the 1-on-1 was held or is scheduled for
    meetingDate: {
      type: Date,
      required: true,
    },
    // Talking points prepared by the leader before the meeting
    discussionPoints: {
      type: String,
      default: '',
    },
    // The leader's private notes from during/after the meeting
    leaderNotes: {
      type: String,
      default: '',
    },
    // Action items for the member or leader to follow up on
    actionItems: [actionItemSchema],
  },
  {
    timestamps: true,
  }
);

// Index for fast querying by leader and member
oneOnOneSchema.index({ leader: 1, memberName: 1, meetingDate: -1 });

const OneOnOne = mongoose.model('OneOnOne', oneOnOneSchema);
module.exports = OneOnOne;
