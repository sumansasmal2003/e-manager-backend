// models/SystemLog.js
const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema(
  {
    // The user who experienced the error
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // The severity of the log
    level: {
      type: String,
      required: true,
      enum: ['ERROR', 'WARN', 'INFO'],
      default: 'ERROR',
    },
    // The API route that failed
    route: {
      type: String,
      required: true,
      default: 'N/A',
    },
    // The error message
    message: {
      type: String,
      required: true,
    },
    // The full error stack for debugging
    stack: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true, // This gives us createdAt
  }
);

// Index for fast querying by user
systemLogSchema.index({ user: 1, createdAt: -1 });

const SystemLog = mongoose.model('SystemLog', systemLogSchema);
module.exports = SystemLog;
