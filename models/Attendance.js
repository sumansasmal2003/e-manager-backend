const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    // The date being marked (e.g., 2025-11-12)
    date: {
      type: Date,
      required: true,
    },
    // The name of the member
    member: {
      type: String,
      required: true,
    },
    // The status for that date
    status: {
      type: String,
      required: true,
      enum: ['Present', 'Absent', 'Leave', 'Holiday'],
      default: 'Present',
    },
    // The leader who is marking this
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Create a compound index to ensure one record per member per day for each leader
attendanceSchema.index({ date: 1, member: 1, leader: 1 }, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);
module.exports = Attendance;
