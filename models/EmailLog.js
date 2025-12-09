const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema(
  {
    // The leader who sent the email
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      required: false
    },
    // The email address it was sent to
    toEmail: {
      type: String,
      required: true,
    },
    // The member name, if applicable (for member reports)
    memberName: {
      type: String,
      default: null,
    },
    subject: {
      type: String,
      required: true,
    },
    // The full HTML content of the email
    html: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Sent', 'Failed'],
      required: true,
    },
    error: {
      type: String, // Store any error message
    },
  },
  {
    timestamps: true, // This adds createdAt
  }
);

// Index for fast querying by user
emailLogSchema.index({ user: 1, createdAt: -1 });

const EmailLog = mongoose.model('EmailLog', emailLogSchema);
module.exports = EmailLog;
