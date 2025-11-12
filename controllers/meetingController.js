const Meeting = require('../models/Meeting');
const { checkTeamMembership } = require('./taskController'); // Use shared check
const axios = require('axios');
const { logActivity } = require('../services/activityService');

// Helper function to get Zoom Access Token
const getZoomAccessToken = async () => {
  try {
    const authUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`;
    const base64Creds = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
    ).toString('base64');

    const { data } = await axios.post(authUrl, {}, {
      headers: {
        'Authorization': `Basic ${base64Creds}`,
      },
    });
    return data.access_token;
  } catch (error) {
    console.error('Error getting Zoom access token:', error.response ? error.response.data : error.message);
    throw new Error('Zoom auth failed');
  }
};

// @desc    Generate a Zoom meeting link
// @route   POST /api/meetings/generate-zoom
exports.generateZoomMeeting = async (req, res) => {
  const { title, meetingTime } = req.body;

  try {
    const accessToken = await getZoomAccessToken();
    const zoomApiUrl = 'https://api.zoom.us/v2/users/me/meetings';

    // --- START OF NEW FIX ---

    let startTime;
    if (meetingTime) {
      // The frontend sends a string like "2025-11-10T14:30"
      // We must manually parse it to avoid time zone errors.

      const [datePart, timePart] = meetingTime.split('T');
      const [year, month, day] = datePart.split('-');
      const [hour, minute] = timePart.split(':');

      // This creates a date object using the server's local time zone,
      // but with the *exact numbers* provided by the user.
      // new Date(YYYY, MM (0-11), DD, HH, mm)
      const userDate = new Date(year, month - 1, day, hour, minute);

      // .toISOString() converts this date to the UTC "Z" format
      // that the Zoom API requires.
      startTime = userDate.toISOString();

    } else {
      // Fallback if meetingTime is somehow still empty
      startTime = new Date().toISOString();
    }

    // --- END OF NEW FIX ---

    const meetingDetails = {
      topic: title || 'New E-Manager Meeting',
      type: 2, // Scheduled meeting
      start_time: startTime, // <-- Use the new, correctly formatted time
      duration: 60,
      // By sending an ISO string (ends in "Z"), we must specify UTC.
      timezone: 'UTC',
      settings: {
        join_before_host: true,
        mute_upon_entry: true,
      },
    };

    const { data } = await axios.post(zoomApiUrl, meetingDetails, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    res.json({
      join_url: data.join_url,
    });

  } catch (error) {
    // This will now catch any errors if the date string is malformed
    console.error('Error creating Zoom meeting:', error.response ? error.response.data : error.message);
    res.status(500).json({ message: 'Failed to create Zoom meeting. Invalid date format.' });
  }
};

// @desc    Schedule a new meeting for a team
exports.scheduleMeeting = async (req, res) => {
  try {
    const { title, agenda, meetingTime, meetingLink, participants } = req.body;
    const team = req.team; // From checkTeamMembership

    // --- LOGIC CHANGED ---
    let finalParticipants = [];

    // If no participants are specified, add all team members
    if (!participants || participants.length === 0) {
      finalParticipants = team.members;
    } else {
      // Validate that all participants are members of the team
      for (const name of participants) {
        if (!team.members.includes(name)) {
          return res.status(400).json({
            message: `Participant "${name}" is not in this team.`
          });
        }
      }
      finalParticipants = participants;
    }

    const meeting = new Meeting({
      team: req.params.teamId,
      title,
      agenda,
      meetingTime,
      meetingLink,
      createdBy: req.user.id,
      participants: finalParticipants, // Now an array of strings
    });

    const createdMeeting = await meeting.save();
    logActivity(
  createdMeeting.team,
  req.user.id,
  'MEETING_SCHEDULED',
  `Scheduled meeting '${createdMeeting.title}' for ${new Date(createdMeeting.meetingTime).toLocaleDateString()}`
);
res.status(201).json(createdMeeting);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get all upcoming meetings for a team
exports.getMeetingsForTeam = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      team: req.params.teamId,
      meetingTime: { $gte: new Date() }
    })
      // No longer need to populate participants
      .sort({ meetingTime: 1 });

    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.checkTeamMembership = checkTeamMembership;
