const { google } = require('googleapis');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { logError } = require('../services/logService');

// --- CONFIGURATION ---
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 1. Client for Calendar Integration (Existing)
// Uses the redirect URI specifically for settings/calendar linking
const calendarAuthClient = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // e.g., http://localhost:5000/api/auth/google/callback
);

// 2. Client for Auth/Registration (New)
// Uses a distinct redirect URI for the login flow
const loginAuthClient = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  `http://localhost:5000/api/auth/google/callback` // e.g., http://localhost:5000/api/google-auth/callback
);

// Helper to generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

/* ======================================================
   SECTION 1: GOOGLE SIGN-IN & REGISTRATION
   (Public Routes - No Login Required)
   ====================================================== */

// @desc    Initiate Google Login/Register
// @route   GET /api/google-auth/google
exports.googleLogin = (req, res) => {
  const url = loginAuthClient.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  res.redirect(url);
};

// @desc    Handle Google Login Callback
// @route   GET /api/google-auth/callback
exports.googleLoginCallback = async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await loginAuthClient.getToken(code);
    loginAuthClient.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: loginAuthClient });
    const { data } = await oauth2.userinfo.get();

    if (!data.email) {
      return res.redirect(`${FRONTEND_URL}/login?error=NoEmailFound`);
    }

    // 1. Check if user exists
    let user = await User.findOne({ email: data.email });

    if (!user) {
      // --- CASE A: NEW USER ---
      // Create with EMPTY companyName to trigger setup flow
      user = await User.create({
        username: data.name,
        email: data.email,
        password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8),
        role: 'owner',
        companyName: '', // <--- EMPTY: Triggers /setup-organization
        isTwoFactorEnabled: false
      });
    }
    // --- CASE B: EXISTING USER ---
    // They already have a companyName (or it's empty if they abandoned setup previously)

    if (user.isActive === false) {
      return res.redirect(`${FRONTEND_URL}/login?error=AccountSuspended`);
    }

    const token = generateToken(user._id);

    let branding = user.branding;
    if (user.role === 'manager' && user.ownerId) {
       const owner = await User.findById(user.ownerId).select('branding');
       if (owner && owner.branding) branding = owner.branding;
    }

    // 2. Prepare Data for Frontend
    const userData = JSON.stringify({
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      subscription: user.subscription,
      branding: branding,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      companyName: user.companyName, // Frontend checks this string
      token: token
    });

    // 3. Redirect to Login Page (Frontend handles the routing logic)
    res.redirect(`${FRONTEND_URL}/login?token=${token}&userData=${encodeURIComponent(userData)}`);

  } catch (error) {
    console.error('Google Login Error:', error);
    res.redirect(`${FRONTEND_URL}/login?error=GoogleAuthFailed`);
  }
};


/* ======================================================
   SECTION 2: CALENDAR INTEGRATION
   (Protected Routes - Requires User to be Logged In)
   ====================================================== */

// @desc    Connect Google Calendar
// @route   GET /api/auth/google
exports.googleAuth = (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  const authUrl = calendarAuthClient.generateAuthUrl({
    access_type: 'offline', // Request refresh token
    scope: scopes,
    state: req.user.id // Pass logged-in user ID
  });

  res.json({ authUrl });
};

// @desc    Handle Calendar Callback
// @route   GET /api/auth/google/callback
exports.googleAuthCallback = async (req, res) => {
  const { code, state } = req.query;
  const userId = state; // Recover user ID from state

  try {
    const { tokens } = await calendarAuthClient.getToken(code);

    const user = await User.findById(userId);
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/settings?google=error`);
    }

    user.googleAccessToken = tokens.access_token;
    if (tokens.refresh_token) {
      user.googleRefreshToken = tokens.refresh_token;
    }
    user.googleCalendarConnected = true;
    await user.save();

    res.redirect(`${process.env.FRONTEND_URL}/settings?google=success`);

  } catch (error) {
    console.error('Google Calendar Callback Error:', error);
    if (userId) logError(userId, error, req.originalUrl);
    res.redirect(`${process.env.FRONTEND_URL}/settings?google=error`);
  }
};

// @desc    Disconnect Google Calendar
// @route   DELETE /api/auth/google/disconnect
exports.googleDisconnect = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.googleAccessToken = undefined;
    user.googleRefreshToken = undefined;
    user.googleCalendarConnected = false;

    await user.save();

    res.json({
      message: 'Google Calendar disconnected',
      googleCalendarConnected: false
    });
  } catch (error) {
    console.error('Google Disconnect Error:', error);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server error while disconnecting' });
  }
};
