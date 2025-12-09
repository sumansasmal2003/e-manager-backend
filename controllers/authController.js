const User = require('../models/User');
const Team = require('../models/Team');
const jwt = require('jsonwebtoken');
const { sendPasswordResetEmail, sendEmail } = require('../services/emailService');
const { logError } = require('../services/logService');
const speakeasy = require('speakeasy');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register a new Organization Owner
// @route   POST /api/auth/register
exports.registerUser = async (req, res) => {
  try {
    // 1. Accept companyName from the request body
    const { username, email, password, companyName } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // 2. Create the Owner with the Company Name
    const user = await User.create({
      username,
      email,
      password,
      role: 'owner',
      ownerId: null,
      companyName: companyName || '', // Default to empty string if not provided
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        companyName: user.companyName, // Return it to frontend
        subscription: user.subscription,
        token: generateToken(user._id),
        connecteamAccounts: user.connecteamAccounts || [],
        googleCalendarConnected: user.googleCalendarConnected,
        createdAt: user.createdAt
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
    logError(null, error, req.originalUrl);
  }
};

// @desc    Create a Manager (Only for Owners)
// @route   POST /api/auth/create-manager
exports.createManager = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Not authorized. Only Owners can create managers.' });
    }

    const { username, email, password, teamId } = req.body; // <-- Accept teamId

    // 1. Validate Team Ownership
    // We ensure the team exists AND is currently owned by the logged-in Owner
    const team = await Team.findOne({ _id: teamId, owner: req.user.id });
    if (!team) {
      return res.status(404).json({ message: 'Team not found or you do not have permission to assign it.' });
    }

    // 2. Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // 3. Create the Manager
    const manager = await User.create({
      username,
      email,
      password,
      role: 'manager',
      ownerId: req.user._id,
      permissions: manager.permissions,
      companyName: req.user.companyName,
      companyAddress: req.user.companyAddress,
      companyWebsite: req.user.companyWebsite
    });

    if (manager) {
      // 4. Transfer Team Ownership to the new Manager
      team.owner = manager._id;
      await team.save();

      // 5. Send Credentials Email
      const emailSubject = `Welcome to ${req.user.companyName} - Your Manager Account`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #111827;">Welcome to ${req.user.companyName}!</h2>
          <p>You have been appointed as the Manager for the team: <strong style="color: #2563eb;">${team.teamName}</strong>.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p>Here are your login credentials:</p>
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 6px;">
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
          </div>
          <p style="margin-top: 20px;">Please log in and consider changing your password.</p>
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://your-app-url.com/login" style="background-color: #111827; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log in to Dashboard</a>
          </div>
        </div>
      `;

      try {
        await sendEmail({
            to: email,
            subject: emailSubject,
            html: emailHtml
        }, req.user.id, null);
      } catch (emailErr) {
          console.error("Failed to send manager email:", emailErr.message);
          // We don't return an error here, as the account creation was successful
      }

      res.status(201).json({
        _id: manager._id,
        username: manager.username,
        email: manager.email,
        role: manager.role,
        createdAt: manager.createdAt,
        message: `Manager created and assigned to ${team.teamName}. Credentials sent.`
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// ... (loginUser, forgotPassword, resetPassword remain the same as previous step)
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Select password AND 2FA fields
    const user = await User.findOne({ email }).select('+password +googleCalendarConnected +isTwoFactorEnabled +isActive');

    if (user && (await user.matchPassword(password))) {

      // Check if suspended
      if (user.isActive === false) {
        return res.status(403).json({ message: 'Your account is suspended. Contact your administrator.' });
      }

      // --- NEW: 2FA Check ---
      if (user.isTwoFactorEnabled) {
        // DO NOT send token yet. Tell frontend to prompt for code.
        return res.json({
          twoFactorRequired: true,
          userId: user._id,
          message: 'Please enter your 2FA code'
        });
      }
      // ----------------------

      // Normal Login (No 2FA)
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        ownerId: user.ownerId,
        permissions: user.permissions,
        subscription: user.subscription,
        branding: user.branding,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        token: generateToken(user._id),
        connecteamAccounts: user.connecteamAccounts,
        googleCalendarConnected: user.googleCalendarConnected,
        companyName: user.companyName,
        createdAt: user.createdAt
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
    logError(null, error, req.originalUrl);
  }
};

// --- NEW: Verify 2FA & Complete Login ---
// @route   POST /api/auth/verify-2fa
exports.verifyTwoFactorLogin = async (req, res) => {
  const { userId, token } = req.body; // 'token' is the 6-digit code

  try {
    const user = await User.findById(userId).select('+twoFactorSecret +googleCalendarConnected');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret.base32,
      encoding: 'base32',
      token: token,
      window: 1 // Allow 30sec drift
    });

    if (verified) {
      // 2FA Success! Send the actual login data
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        ownerId: user.ownerId,
        permissions: user.permissions,
        subscription: user.subscription,
        branding: user.branding,
        isTwoFactorEnabled: true,
        token: generateToken(user._id), // The real JWT
        connecteamAccounts: user.connecteamAccounts,
        googleCalendarConnected: user.googleCalendarConnected,
        companyName: user.companyName,
        createdAt: user.createdAt
      });
    } else {
      res.status(401).json({ message: 'Invalid 2FA Code' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Please provide an email' });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: 'If an account with this email exists, a reset code has been sent.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.passwordResetOTP = otp;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    await user.save();
    sendPasswordResetEmail(user.email, otp, user._id);

    res.json({ message: 'If an account with this email exists, a reset code has been sent.' });

  } catch (error) {
    console.error('Forgot Password Error:', error.message);
    res.status(500).json({ message: 'Server error' });
    logError(null, error, req.originalUrl);
  }
};

exports.resetPassword = async (req, res) => {
  const { otp, password } = req.body;

  if (!otp || !password) {
    return res.status(400).json({ message: 'Please provide OTP and new password' });
  }

  try {
    const user = await User.findOne({
      passwordResetOTP: otp,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    user.password = password;
    user.passwordResetOTP = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    res.json({ message: 'Password reset successfully' });

  } catch (error) {
    console.error('Reset Password Error:', error.message);
    res.status(500).json({ message: 'Server error' });
    logError(null, error, req.originalUrl);
  }
};
