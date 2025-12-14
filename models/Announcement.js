const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  message: {
    type: String,
    required: [true, 'Please add a message'],
    trim: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'low'
  },
  expiresAt: {
    type: Date,
    required: [true, 'Please add an expiration date']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Optional: Target specific roles? For now, we assume "All"
}, {
  timestamps: true
});

// Auto-delete expired announcements (TTL Index)
// This automatically removes documents from MongoDB after 'expiresAt' passes
announcementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Announcement', announcementSchema);
