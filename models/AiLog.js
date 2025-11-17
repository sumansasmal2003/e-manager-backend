// models/AiLog.js
const mongoose = require('mongoose');

const aiLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // This is the key field we will group by
    actionType: {
      type: String,
      required: true,
      enum: [
        // Chat Agent Actions
        'AI_GET_ANSWER',
        'AI_CREATE_TASK',
        'AI_UPDATE_TASKS',
        'AI_DELETE_TASKS',
        'AI_SCHEDULE_MEETING',
        'AI_UPDATE_MEETING',
        'AI_DELETE_MEETING',
        'AI_ADD_NOTE',
        'AI_UPDATE_NOTE',
        'AI_DELETE_NOTE',
        'AI_DRAFT_EMAIL',
        'AI_PROACTIVE_INSIGHT',
        'AI_TASK_ESTIMATE',

        // Other AI Features
        'AI_GENERATE_SUBTASKS',
        'AI_MEMBER_REPORT',
        'AI_TALKING_POINTS',
        'AI_DAILY_BRIEFING',
        'AI_TEAM_REPORT',
        'AI_WORD_PUZZLE', // From GamePage
      ],
    },
  },
  {
    timestamps: true, // This gives us createdAt
  }
);

// Index for fast querying by user
aiLogSchema.index({ user: 1, createdAt: -1 });

const AiLog = mongoose.model('AiLog', aiLogSchema);
module.exports = AiLog;
