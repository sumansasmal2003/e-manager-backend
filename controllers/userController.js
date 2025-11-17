const User = require('../models/User');
const Team = require('../models/Team');
const Task = require('../models/Task');
const Note = require('../models/Note');
const TeamNote = require('../models/TeamNote');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Attendance = require('../models/Attendance');
const EmailLog = require('../models/EmailLog');
const MemberProfile = require('../models/MemberProfile');
const OneOnOne = require('../models/OneOnOne');
const { logError } = require('../services/logService');

// @desc    Get logged-in user's profile
// @route   GET /api/user/profile
exports.getUserProfile = async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user) {
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      connecteamAccounts: user.connecteamAccounts, // <-- Must be this
      googleCalendarConnected: user.googleCalendarConnected, // <-- Must be included
      companyName: user.companyName,
      companyAddress: user.companyAddress,
      companyWebsite: user.companyWebsite,
      ceoName: user.ceoName,
      hrName: user.hrName,
      hrEmail: user.hrEmail,
      createdAt: updatedUser.createdAt
    });
  } else {
    res.status(404).json({ message: 'User not found' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Add a ConnecTeam account
// @route   POST /api/user/connecteam
exports.addConnecteamAccount = async (req, res) => {
  const { name, link } = req.body;
  if (!name || !link) {
    return res.status(400).json({ message: 'Please provide a name and a link' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.connecteamAccounts.push({ name, link });
    await user.save();

    // Send back just the new array
    res.status(201).json(user.connecteamAccounts);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a ConnecTeam account
// @route   DELETE /api/user/connecteam/:id
exports.deleteConnecteamAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const accountId = req.params.id;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const accountToDelete = user.connecteamAccounts.id(accountId);
    if (!accountToDelete) {
      return res.status(404).json({ message: 'Account not found' });
    }

    accountToDelete.deleteOne();
    await user.save();

    // Send back the updated array
    res.json(user.connecteamAccounts);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Update user profile (username, email, & company info)
// @route   PUT /api/user/profile
exports.updateUserProfile = async (req, res) => {
  // 1. Destructure all fields from the body
  const {
    username, email,
    companyName, companyAddress, companyWebsite,
    ceoName, hrName, hrEmail
  } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is already taken
    if (email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email is already in use' });
      }
    }

    // Check if username is already taken
    if (username !== user.username) {
        const usernameExists = await User.findOne({ username });
        if (usernameExists) {
             return res.status(400).json({ message: 'Username is already taken' });
        }
    }

    // 2. Update all fields
    user.username = username || user.username;
    user.email = email || user.email;

    // Use nullish coalescing (??) to allow setting fields to an empty string ""
    user.companyName = companyName ?? user.companyName;
    user.companyAddress = companyAddress ?? user.companyAddress;
    user.companyWebsite = companyWebsite ?? user.companyWebsite;
    user.ceoName = ceoName ?? user.ceoName;
    user.hrName = hrName ?? user.hrName;
    user.hrEmail = hrEmail ?? user.hrEmail;

    const updatedUser = await user.save();

    // 3. Send back all fields that the AuthContext uses
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      connecteamAccounts: updatedUser.connecteamAccounts,
      googleCalendarConnected: updatedUser.googleCalendarConnected,
      companyName: updatedUser.companyName,
      companyAddress: updatedUser.companyAddress,
      companyWebsite: updatedUser.companyWebsite,
      ceoName: updatedUser.ceoName,
      hrName: updatedUser.hrName,
      hrEmail: updatedUser.hrEmail,
      createdAt: user.createdAt
    });
  } catch (error) {
    // Handle potential validation errors (e.g., bad HR email)
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// --- ADD THIS NEW FUNCTION ---
// @desc    Change user password
// @route   PUT /api/user/change-password
exports.changeUserPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Please provide all fields' });
  }

  try {
    // We must select '+password' as it's hidden by default
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if current password matches
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid current password' });
    }

    // Set new password (pre-save hook in User model will hash it)
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

/**
 * @desc    Delete user account and all associated data
 * @route   DELETE /api/user/profile
 */
exports.deleteUserAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Find all teams owned by the user
    const userTeams = await Team.find({ owner: userId }).select('_id');
    const teamIds = userTeams.map(team => team._id);

    // 2. Perform a massive cascading delete in parallel
    await Promise.all([
      // Delete all data associated with the user's teams
      Task.deleteMany({ team: { $in: teamIds } }),
      Meeting.deleteMany({ team: { $in: teamIds } }),
      TeamNote.deleteMany({ team: { $in: teamIds } }),
      Activity.deleteMany({ team: { $in: teamIds } }),

      // Delete the teams themselves
      Team.deleteMany({ owner: userId }),

      // Delete all personal data linked to the user
      Note.deleteMany({ user: userId }),
      Attendance.deleteMany({ leader: userId }),
      MemberProfile.deleteMany({ leader: userId }),
      OneOnOne.deleteMany({ leader: userId }),
      EmailLog.deleteMany({ user: userId }),

      // Finally, delete the user
      User.findByIdAndDelete(userId)
    ]);

    res.json({ message: 'Account and all associated data deleted successfully.' });

  } catch (error) {
    console.error('Delete User Account Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};
