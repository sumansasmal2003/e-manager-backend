const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Team',
    },
    title: {
      type: String,
      required: [true, 'Please add a meeting title'],
      trim: true,
    },
    agenda: {
      type: String,
      default: '',
    },
    meetingTime: {
      type: Date,
      required: [true, 'Please set a meeting time'],
    },
    meetingLink: {
      type: String,
      required: [true, 'Please provide a meeting link'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    participants: [
      {
        type: String, // <-- CHANGED: Now a list of names
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Meeting = mongoose.model('Meeting', meetingSchema);
module.exports = Meeting;
