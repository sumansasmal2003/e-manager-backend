const mongoose = require('mongoose');

const memberProfileSchema = new mongoose.Schema(
  {
    // The leader this profile belongs to
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // The member's name (the unique key)
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      default: '',
      // Optional: Add email validation
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please fill a valid email address',
      ],
    },
    joiningDate: {
      type: Date,
      default: null,
    },
    endingDate: {
      type: Date,
      default: null,
    },
    // You could add more fields here later
    // email: { type: String, default: '' },
    // role: { type: String, default: 'Member' },
  },
  {
    timestamps: true,
  }
);

// Ensure a leader can only have one profile per member name
memberProfileSchema.index({ leader: 1, name: 1 }, { unique: true });

const MemberProfile = mongoose.model('MemberProfile', memberProfileSchema);
module.exports = MemberProfile;
