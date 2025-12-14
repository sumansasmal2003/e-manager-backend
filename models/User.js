const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connecteamAccountSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Please provide a name'], trim: true },
  link: { type: String, required: [true, 'Please provide the link'], trim: true },
});

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please fill a valid email address',
    ],
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false,
  },

  // --- HIERARCHY FIELDS ---
  role: {
    type: String,
    enum: ['owner', 'manager', 'employee'],
    default: 'owner', // Default to owner for new signups
    required: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // --- COMPANY FIELDS ---
  companyName: { type: String, trim: true, default: '' },
  companyAddress: { type: String, trim: true, default: '' },
  companyWebsite: { type: String, trim: true, default: '' },
  ceoName: { type: String, trim: true, default: '' },
  hrName: { type: String, trim: true, default: '' },
  hrEmail: { type: String, trim: true, default: '' },

  // --- NEW: SUBSCRIPTION FIELDS ---
  // This is where the plan is stored.
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'professional', 'premium'],
      default: 'free' // <--- THIS LINE makes it automatic!
    },

    adWatchProgress: { type: Number, default: 0 },
    targetUpgradePlan: { type: String, default: null },

    status: {
      type: String,
      enum: ['active', 'canceled', 'past_due'],
      default: 'active'
    },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: null }, // Null means "Free Forever"
    aiUsageCount: { type: Number, default: 0 },
    lastUsageReset: { type: Date, default: Date.now }
  },
  // ------------------------------

  aiAllocatedLimit: {
    type: Number,
    default: null // null = Use Shared Pool. Number = Specific Limit. 0 = Blocked.
  },

  isActive: {
    type: Boolean,
    default: true, // Active by default
  },

  permissions: {
    canCreateTasks: { type: Boolean, default: true },
    canCreateMeetings: { type: Boolean, default: true },
    canCreateNotes: { type: Boolean, default: true },

    canDeleteTasks: { type: Boolean, default: true },
    canDeleteMeetings: { type: Boolean, default: true },
    canDeleteNotes: { type: Boolean, default: true },
    canExportReports: { type: Boolean, default: false }, // Default false for security

    canCreateResources: { type: Boolean, default: true },
    canDeleteResources: { type: Boolean, default: true },
    canHireEmployees: { type: Boolean, default: false },
    canRemoveMembers: { type: Boolean, default: false },

    canUseAI: { type: Boolean, default: true },

    canViewCalendar: { type: Boolean, default: true },
    canAccessGameSpace: { type: Boolean, default: true },
    canViewNotifications: { type: Boolean, default: true },
    canViewSystemLog: { type: Boolean, default: false },

    canMarkAttendance: { type: Boolean, default: false },

    canEditTasks: { type: Boolean, default: true }
  },

  connecteamAccounts: [connecteamAccountSchema],
  passwordResetOTP: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  googleAccessToken: { type: String, select: false },
  googleRefreshToken: { type: String, select: false },
  googleCalendarConnected: { type: Boolean, default: false },
  isTwoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: {
    type: Object, // speakeasy stores an object with ascii, hex, base32
    select: false, // Hide by default
  },
  branding: {
    logoUrl: { type: String, default: '' }, // URL from Cloudinary/S3
    primaryColor: { type: String, default: '#111827' }, // Default Zinc-900
    savedColors: { type: [String], default: [] }
  },
}, {
  timestamps: true,
});

// Middleware: Hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
