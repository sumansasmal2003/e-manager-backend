// models/Insight.js
const mongoose = require('mongoose');

const insightSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // The type of insight for UI (icon, color)
    type: {
      type: String,
      required: true,
      enum: ['Warning', 'Suggestion', 'Insight'],
      default: 'Insight',
    },
    // The bold headline
    title: {
      type: String,
      required: true,
    },
    // The full descriptive message
    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    // (Optional V2): Add related item IDs
    // relatedItems: [{ type: mongoose.Schema.Types.ObjectId }]
  },
  {
    timestamps: true, // This gives us createdAt
  }
);

insightSchema.index({ user: 1, isRead: 1, createdAt: -1 });

const Insight = mongoose.model('Insight', insightSchema);
module.exports = Insight;
