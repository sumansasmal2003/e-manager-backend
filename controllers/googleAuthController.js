// controllers/googleAuthController.js
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI // Your backend callback URL
);

// @desc    Redirects user to Google's auth screen
// @route   GET /api/auth/google
exports.googleAuth = (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline', // IMPORTANT: Asks for a refresh_token
    scope: scopes,
    // Pass the user's ID so we know who to save the token for
    state: req.user.id
  });
  // res.redirect(authUrl);
  res.json({ authUrl });
};

// @desc    Handles the callback from Google
// @route   GET /api/auth/google/callback
exports.googleAuthCallback = async (req, res) => {
  const { code, state } = req.query;
  const userId = state; // Get the user's ID we passed in

  try {
    // 1. Exchange the code for tokens
    const { tokens } = await oAuth2Client.getToken(code);
    const { access_token, refresh_token } = tokens;

    // 2. Find the user and save the tokens
    const user = await User.findById(userId);
    if (!user) {
      // This should not happen if the flow started correctly
      return res.redirect('https://emanagerpro.vercel.app/settings?google=error');
    }

    user.googleAccessToken = access_token;
    if (refresh_token) {
      // A refresh token is only given the FIRST time a user authorizes
      user.googleRefreshToken = refresh_token;
    }
    user.googleCalendarConnected = true;
    await user.save();

    // 3. Redirect back to the frontend settings page
    res.redirect('https://emanagerpro.vercel.app/settings?google=success');

  } catch (error) {
    console.error('Google Auth Callback Error:', error);
    res.redirect('YOUR_FRONTEND_URL/settings?google=error');
  }
};

/**
 * @desc    Disconnects Google Calendar and revokes tokens
 * @route   DELETE /api/auth/google/disconnect
 */
exports.googleDisconnect = async (req, res) => {
  try {
    // 1. Find the user and explicitly select the tokens
    const user = await User.findById(req.user.id).select(
      '+googleAccessToken +googleRefreshToken'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Clear the Google-related fields
    user.googleAccessToken = undefined;
    user.googleRefreshToken = undefined;
    user.googleCalendarConnected = false;

    await user.save();

    // 3. Send back the updated (and non-sensitive) user info
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      connecteamAccounts: user.connecteamAccounts,
      googleCalendarConnected: user.googleCalendarConnected, // This will now be false
    });
  } catch (error) {
    console.error('Google Disconnect Error:', error);
    res.status(500).json({ message: 'Server error while disconnecting' });
  }
};
