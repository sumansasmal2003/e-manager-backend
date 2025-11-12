const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Team',
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    actionType: {
      type: String,
      required: true,
      // Examples of action types
      enum: [
        'TEAM_CREATED',
        'MEMBER_ADDED',
        'MEMBER_REMOVED',
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_DELETED',
        'MEETING_SCHEDULED',
        'NOTE_CREATED',
        'NOTE_DELETED',
        'FIGMA_LINK_ADDED',
        'FIGMA_LINK_DELETED',
        'GITHUB_REPO_ADDED',
        'GITHUB_REPO_DELETED',
        'LIVE_LINK_ADDED',
        'LIVE_LINK_DELETED',
      ],
    },
    // The human-readable text, e.g., "John Doe created task 'Design Homepage'"
    details: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // This gives us a `createdAt` field for the feed
  }
);

const Activity = mongoose.model('Activity', activitySchema);
module.exports = Activity;
