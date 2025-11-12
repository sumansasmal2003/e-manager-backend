const mongoose = require('mongoose');

const figmaFileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a file name'],
    trim: true,
  },
  link: {
    type: String,
    required: [true, 'Please provide a file link'],
    trim: true,
  },
});

const githubRepoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a repo name'],
    trim: true,
  },
  link: {
    type: String,
    required: [true, 'Please provide a repo link'],
    trim: true,
  },
});

const liveProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a project name'],
    trim: true,
  },
  link: {
    type: String,
    required: [true, 'Please provide a project link'],
    trim: true,
  },
});

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
    figmaFiles: [figmaFileSchema],
    githubRepos: [githubRepoSchema],
    liveProjects: [liveProjectSchema],
  },
  {
    timestamps: true,
  }
);

const Team = mongoose.model('Team', teamSchema);
module.exports = Team;
