// services/googleCalendarService.js
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

exports.getGoogleCalendarClient = async (user) => {
  if (!user.googleCalendarConnected || !user.googleRefreshToken) {
    throw new Error('User not connected to Google Calendar');
  }

  const oAuth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  // Set the credentials from the stored tokens
  oAuth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });

  // Check if access token is expired and refresh if needed
  if (oAuth2Client.isTokenExpiring()) {
    try {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      user.googleAccessToken = credentials.access_token;
      await user.save(); // Save the new access token
    } catch (error) {
      console.error('Failed to refresh Google access token:', error);
      user.googleCalendarConnected = false;
      await user.save();
      throw new Error('Failed to refresh token. Please reconnect.');
    }
  }

  // Create and return the calendar API client
  return google.calendar({ version: 'v3', auth: oAuth2Client });
};
