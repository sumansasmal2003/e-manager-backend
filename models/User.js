const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connecteamAccountSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name for the account'],
    trim: true,
  },
  link: {
    type: String,
    required: [true, 'Please provide the link'],
    trim: true,
  },
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
    select: false, // Don't send password in responses by default
  },
  connecteamAccounts: [connecteamAccountSchema],
  passwordResetOTP: {
    type: String,
    select: false, // Don't send this in responses by default
  },
  passwordResetExpires: {
    type: Date,
    select: false, // Don't send this in responses by default
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
});

// Middleware: Hash password before saving the user
userSchema.pre('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method: Compare entered password with hashed password in DB
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
