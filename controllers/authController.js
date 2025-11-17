const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendPasswordResetEmail } = require('../services/emailService');
const { logError } = require('../services/logService');

// Helper function to create a token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token expires in 30 days
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
exports.registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // 2. Create new user
    const user = await User.create({
      username,
      email,
      password,
    });

    // 3. Respond with user data and a token
    if (user) {
      res.status(201).json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
        connecteamAccounts: user.connecteamAccounts || [],
        googleCalendarConnected: user.googleCalendarConnected,
        companyName: user.companyName,
        companyAddress: user.companyAddress,
        companyWebsite: user.companyWebsite,
        ceoName: user.ceoName,
        hrName: user.hrName,
        hrEmail: user.hrEmail,
        createdAt: user.createdAt
      });

      // We will add the nodemailer welcome email here later!

    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Authenticate user & get token (Login)
// @route   POST /api/auth/login
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check if email and password are provided
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // 2. Find user by email (and explicitly include password AND googleCalendarConnected)
    // --- THIS IS THE FIRST PART OF THE FIX ---
    const user = await User.findOne({ email }).select('+password +googleCalendarConnected');

    // 3. Check if user exists and password matches
    if (user && (await user.matchPassword(password))) {
      // 4. Respond with user data and token
      // --- THIS IS THE SECOND PART OF THE FIX ---
      res.json({
        _id: user._id,
        username: user.username,
        email: user.email,
        token: generateToken(user._id),
        connecteamAccounts: user.connecteamAccounts,
        googleCalendarConnected: user.googleCalendarConnected, // <-- This will now have the value
        companyName: user.companyName,
        companyAddress: user.companyAddress,
        companyWebsite: user.companyWebsite,
        ceoName: user.ceoName,
        hrName: user.hrName,
        hrEmail: user.hrEmail,
        createdAt: user.createdAt
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

/**
 * @desc    Forgot password - request an OTP
 * @route   POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Please provide an email' });
  }

  try {
    const user = await User.findOne({ email });

    // IMPORTANT: For security, we send a 200 OK response even if the
    // user is not found. This prevents email enumeration attacks.
    if (!user) {
      return res.json({ message: 'If an account with this email exists, a reset code has been sent.' });
    }

    // 1. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 2. Set OTP and 10-minute expiry on the user
    user.passwordResetOTP = otp;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // 3. Send email (fire and forget)
    sendPasswordResetEmail(user.email, otp, user._id);

    res.json({ message: 'If an account with this email exists, a reset code has been sent.' });

  } catch (error) {
    console.error('Forgot Password Error:', error.message);
    res.status(500).json({ message: 'Server error' });
    logError(userId, error, req.originalUrl);
  }
};

/**
 * @desc    Reset password using OTP
 * @route   POST /api/auth/reset-password
 */
exports.resetPassword = async (req, res) => {
  const { otp, password } = req.body;

  if (!otp || !password) {
    return res.status(400).json({ message: 'Please provide OTP and new password' });
  }

  try {
    // 1. Find the user by the valid (non-expired) OTP
    const user = await User.findOne({
      passwordResetOTP: otp,
      passwordResetExpires: { $gt: Date.now() }, // Check if not expired
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    // 2. Set the new password
    // The pre-save hook in models/User.js will automatically hash it
    user.password = password;

    // 3. Clear the OTP fields
    user.passwordResetOTP = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    res.json({ message: 'Password reset successfully' });

  } catch (error) {
    console.error('Reset Password Error:', error.message);
    res.status(500).json({ message: 'Server error' });
    logError(userId, error, req.originalUrl);
  }
};
