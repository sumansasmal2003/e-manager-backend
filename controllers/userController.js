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
const { sendAccountStatusEmail } = require('../services/emailService');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const getInheritedBranding = async (user) => {
  let branding = user.branding;
  let companyName = user.companyName;

  // If user is Manager or Employee, fetch Owner's branding
  if (['manager', 'employee'].includes(user.role) && user.ownerId) {
    const owner = await User.findById(user.ownerId).select('branding companyName');
    if (owner) {
      if (owner.branding) branding = owner.branding;
      if (!companyName && owner.companyName) companyName = owner.companyName;
    }
  }
  return { branding, companyName };
};

// @desc    Get logged-in user's profile
// @route   GET /api/user/profile
exports.getUserProfile = async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user) {
    const { branding, companyName } = await getInheritedBranding(user);
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      ownerId: user.ownerId,
      permissions: user.permissions,
      subscription: user.subscription,
      branding: branding,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      connecteamAccounts: user.connecteamAccounts, // <-- Must be this
      googleCalendarConnected: user.googleCalendarConnected, // <-- Must be included
      companyName: companyName,
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

// @desc    Change user plan (Free <-> Pro <-> Premium)
// @route   PUT /api/user/subscription
exports.updateSubscription = async (req, res) => {
  const { plan } = req.body; // 'free', 'professional', 'premium'

  if (!['free', 'professional', 'premium'].includes(plan)) {
    return res.status(400).json({ message: 'Invalid plan type' });
  }

  try {
    const user = await User.findById(req.user.id);

    // Update plan
    user.subscription.plan = plan;
    user.subscription.status = 'active';

    // Set expiration (e.g., 30 days from now for paid plans)
    if (plan !== 'free') {
      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);
      user.subscription.endDate = nextMonth;
    } else {
      user.subscription.endDate = null; // Free forever
    }

    await user.save();

    res.json({
      message: `Successfully upgraded to ${plan}`,
      subscription: user.subscription
    });

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
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

    const { branding, companyName: resolvedCompanyName } = await getInheritedBranding(updatedUser);

    // 3. Send back all fields that the AuthContext uses
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      branding: branding,
      connecteamAccounts: updatedUser.connecteamAccounts,
      googleCalendarConnected: updatedUser.googleCalendarConnected,
      companyName: resolvedCompanyName,
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

// @route   GET /api/user/managers
exports.getMyManagers = async (req, res) => {
  try {
    // req.user.id is the Owner's ID
    const managers = await User.find({ ownerId: req.user.id })
      .select('-password -connecteamAccounts -googleAccessToken -googleRefreshToken'); // Exclude sensitive/large data

    res.json(managers);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// --- NEW: Delete Manager (Owner Only) ---
// @route   DELETE /api/user/managers/:id
exports.deleteManager = async (req, res) => {
  try {
    const managerId = req.params.id;
    const ownerId = req.user.id; // The Owner taking back control

    // 1. Verify this manager belongs to this owner
    const manager = await User.findOne({ _id: managerId, ownerId: ownerId });
    if (!manager) {
      return res.status(404).json({ message: 'Manager not found or unauthorized' });
    }

    // --- TRANSFER ASSETS START ---

    // 2. Transfer Teams
    // All teams owned by the Manager now belong to the Owner
    await Team.updateMany({ owner: managerId }, { owner: ownerId });

    // 3. Transfer Member Profiles
    // We attempt to move all member profiles to the Owner.
    // Note: If the Owner ALREADY has a member with the exact same name,
    // this might throw a duplicate key error (due to our unique index).
    // We use a try/catch block to allow the operation to continue even if some profiles fail to transfer.
    try {
      await MemberProfile.updateMany({ leader: managerId }, { leader: ownerId });
    } catch (err) {
      console.warn("Some member profiles could not be transferred due to duplicate names.", err.message);
    }

    // 4. Transfer Attendance Records
    await Attendance.updateMany({ leader: managerId }, { leader: ownerId });

    // 5. Transfer 1-on-1 Records
    await OneOnOne.updateMany({ leader: managerId }, { leader: ownerId });

    // --- TRANSFER ASSETS END ---

    // 6. Delete Personal Data & The User Account
    // We still delete data that is strictly personal to the manager's account login
    await Note.deleteMany({ user: managerId }); // Personal notes
    await EmailLog.deleteMany({ user: managerId }); // Email history

    // Finally, delete the manager user
    await User.findByIdAndDelete(managerId);

    res.json({ message: `Manager ${manager.username} removed. Their Teams, Members, and Data have been transferred to you.` });

  } catch (error) {
    console.error('Delete Manager Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
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

// --- NEW: Update Manager Permissions ---
// @route   PUT /api/user/managers/:id/permissions
exports.updateManagerPermissions = async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { permissions } = req.body;

    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Only Owners can manage permissions.' });
    }

    // Find the user (Manager or Employee) that belongs to this owner
    // We check ownerId OR if they are an employee in a team owned by this owner hierarchy
    // Simple check: ownerId matches req.user.id (Direct Report) OR ...
    // Actually, for employees created by managers, ownerId might be the Manager's ID?
    // Wait, in authController: rootOwnerId = owner._id. So all employees link to Root Owner.

    const targetUser = await User.findOne({ _id: targetUserId, ownerId: req.user.id });

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found or not in your organization.' });
    }

    targetUser.permissions = {
      ...targetUser.permissions,
      ...permissions
    };

    await targetUser.save();

    res.json({
      message: 'Permissions updated successfully',
      permissions: targetUser.permissions
    });

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// --- NEW: Toggle Manager Suspension ---
// @route   PUT /api/user/managers/:id/suspend
exports.toggleManagerStatus = async (req, res) => {
  try {
    const managerId = req.params.id;

    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Only Owners can suspend managers.' });
    }

    const manager = await User.findOne({ _id: managerId, ownerId: req.user.id });

    if (!manager) {
      return res.status(404).json({ message: 'Manager not found.' });
    }

    manager.isActive = !manager.isActive;
    await manager.save();

    // --- SEND EMAIL ---
    try {
      const isSuspended = !manager.isActive;
      await sendAccountStatusEmail(
        manager.email,
        manager.username,
        req.user.companyName,
        isSuspended
      );
    } catch (emailErr) {
      console.error("Failed to send suspension email:", emailErr.message);
    }

    const statusMsg = manager.isActive ? 'activated' : 'suspended';

    res.json({
      message: `Manager ${manager.username} has been ${statusMsg}.`,
      isActive: manager.isActive
    });

  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Track Ad Watch & Upgrade
// @route   POST /api/user/subscription/watch-ad
exports.recordAdWatch = async (req, res) => {
  try {
    // 1. Normalize input
    const targetPlan = req.body.targetPlan.trim().toLowerCase();

    const REQUIREMENTS = {
      professional: 20,
      premium: 50
    };

    if (!REQUIREMENTS[targetPlan]) {
      return res.status(400).json({ message: 'Invalid target plan.' });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Ensure subscription object exists
    if (!user.subscription) {
        user.subscription = { plan: 'free', adWatchProgress: 0 };
    }

    // 3. Logic to Check for Reset
    // We strictly check if the target has CHANGED.
    const currentTarget = (user.subscription.targetUpgradePlan || '').toLowerCase();

    if (currentTarget !== targetPlan) {
      console.log(`User ${user.username} switched target to ${targetPlan}. Resetting.`);
      user.subscription.targetUpgradePlan = targetPlan;
      user.subscription.adWatchProgress = 0;
    }

    // 4. Increment
    user.subscription.adWatchProgress = (user.subscription.adWatchProgress || 0) + 1;

    // 5. Check for Upgrade
    const needed = REQUIREMENTS[targetPlan];
    let upgraded = false;

    if (user.subscription.adWatchProgress >= needed) {
      user.subscription.plan = targetPlan;
      user.subscription.status = 'active';
      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);
      user.subscription.endDate = nextMonth;

      // Reset counters
      user.subscription.adWatchProgress = 0;
      user.subscription.targetUpgradePlan = null;

      upgraded = true;
    }

    // --- CRITICAL FIX: Force Mongoose to see the change ---
    user.markModified('subscription');
    // -----------------------------------------------------

    await user.save();

    res.json({
      progress: user.subscription.adWatchProgress,
      needed: needed,
      upgraded: upgraded,
      subscription: user.subscription,
      message: upgraded
        ? `Congratulations! You have been upgraded to ${targetPlan}.`
        : `Ad watched. ${needed - user.subscription.adWatchProgress} more to go!`
    });

  } catch (error) {
    console.error('Ad Watch Error:', error);
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// --- NEW: Generate 2FA Secret & QR Code ---
// @route   POST /api/user/2fa/generate
exports.generate2FASecret = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // Create temporary secret (don't enable yet)
    const secret = speakeasy.generateSecret({
      name: `E-Manager (${user.email})`
    });

    // Save secret to DB (but isTwoFactorEnabled is still false)
    user.twoFactorSecret = secret;
    await user.save();

    // Generate QR Code
    qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
      if (err) throw err;

      res.json({
        message: 'Scan this QR code with Google Authenticator',
        secret: secret.base32, // Show manual code too
        qrCode: data_url // The image string
      });
    });

  } catch (error) {
    res.status(500).json({ message: 'Server Error generating 2FA' });
  }
};

// --- NEW: Verify & Enable 2FA ---
// @route   POST /api/user/2fa/enable
exports.enable2FA = async (req, res) => {
  const { token } = req.body; // 6-digit code

  try {
    const user = await User.findById(req.user.id).select('+twoFactorSecret');

    if (!user.twoFactorSecret) {
      return res.status(400).json({ message: 'No 2FA setup found. Generate a secret first.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret.base32,
      encoding: 'base32',
      token: token
    });

    if (verified) {
      user.isTwoFactorEnabled = true;
      await user.save();
      res.json({ message: '2FA is now enabled successfully.' });
    } else {
      res.status(400).json({ message: 'Invalid code. Please try again.' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// --- NEW: Disable 2FA ---
// @route   POST /api/user/2fa/disable
exports.disable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.isTwoFactorEnabled = false;
    user.twoFactorSecret = undefined; // Clear secret
    await user.save();

    res.json({ message: '2FA has been disabled.' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update Organization Branding
// @route   PUT /api/user/branding
exports.updateBranding = async (req, res) => {
  try {
    // Only Owners can rebrand
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Only Organization Owners can update branding.' });
    }

    // 1. Destructure savedColors as well
    const { logoUrl, primaryColor, savedColors } = req.body;
    const user = await User.findById(req.user.id);

    if (logoUrl !== undefined) user.branding.logoUrl = logoUrl;
    if (primaryColor !== undefined) user.branding.primaryColor = primaryColor;

    // 2. Save the custom colors list if provided
    if (savedColors !== undefined) user.branding.savedColors = savedColors;

    await user.save();

    res.json({
      message: 'Branding updated successfully',
      branding: user.branding
    });

  } catch (error) {
    console.error('Branding Update Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
