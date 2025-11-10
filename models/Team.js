const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: [true, 'Please provide a team name'],
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User', // The user who created the team
    },
    members: [
      {
        type: String, // <-- CHANGED: Now a simple list of names
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Team = mongoose.model('Team', teamSchema);
module.exports = Team;
