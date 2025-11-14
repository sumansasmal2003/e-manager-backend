const Meeting = require('../models/Meeting');
const { checkTeamMembership } = require('./taskController'); // Use shared check
const axios = require('axios');
const { logActivity } = require('../services/activityService');
const Team = require('../models/Team');
const { getGoogleCalendarClient } = require('../services/googleCalendarService'); // <-- IMPORT HELPER
const User = require('../models/User');

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
  const { title, meetingTime, timezone } = req.body;

  try {
    const accessToken = await getZoomAccessToken();
    const zoomApiUrl = 'https://api.zoom.us/v2/users/me/meetings';

    let formattedStartTime;
    try {
      const dateObj = new Date(meetingTime);

      // 1. .toISOString() gives "2025-11-14T09:00:00.000Z"
      // 2. We split at the decimal point to remove milliseconds.
      // 3. We add the "Z" back to signify UTC.
      formattedStartTime = dateObj.toISOString().split('.')[0] + "Z";
      // The result is "2025-11-14T09:00:00Z", which Zoom accepts.

    } catch (e) {
      return res.status(400).json({ message: 'Invalid meetingTime format. Expected ISO string.' });
    }

    const meetingDetails = {
      topic: title || 'New E-Manager Meeting',
      type: 2, // Scheduled meeting
      start_time: formattedStartTime, // <-- Use the new, correctly formatted time
      duration: 60,
      // By sending an ISO string (ends in "Z"), we must specify UTC.
      timezone: timezone || 'UTC',
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
try {
      // Find the user with their tokens
      const user = await User.findById(req.user.id).select('+googleAccessToken +googleRefreshToken');
      if (user.googleCalendarConnected) {
        const calendar = await getGoogleCalendarClient(user);

        // Assume meetingTime is a full ISO string from the frontend
        const startTime = new Date(meetingTime);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration

        const event = {
          summary: title,
          description: agenda,
          start: {
            dateTime: startTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          end: {
            dateTime: endTime.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        };

        await calendar.events.insert({
          calendarId: 'primary',
          resource: event,
        });
      }
    } catch (gcalError) {
      console.error('Failed to push event to Google Calendar:', gcalError.message);
      // Do not send this error to the user, just log it.
    }
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

/**
 * @desc    Update a meeting
 * @route   PUT /api/meetings/meeting/:id
 */
exports.updateMeeting = async (req, res) => {
  try {
    const { title, agenda, meetingTime, meetingLink, participants } = req.body;
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // --- Authorization Check (remains the same) ---
    const team = await Team.findById(meeting.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found for this meeting' });
    }
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    // --- Participant Validation (remains the same) ---
    let finalParticipants = meeting.participants;
    if (participants) {
      // ... (existing participant logic)
    }

    // --- THIS IS THE FIX ---
    // Update fields
    meeting.title = title || meeting.title;
    meeting.agenda = agenda || meeting.agenda;
    meeting.meetingLink = meetingLink || meeting.meetingLink;
    meeting.participants = finalParticipants;

    // Manually parse the meetingTime string to avoid timezone errors
    if (meetingTime) {
      meeting.meetingTime = meetingTime;
    }
    // --- END OF FIX ---

    const updatedMeeting = await meeting.save();

    logActivity(
      updatedMeeting.team,
      req.user.id,
      'MEETING_UPDATED',
      `Updated meeting '${updatedMeeting.title}'`
    );

    res.json(updatedMeeting);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * @desc    Delete a meeting
 * @route   DELETE /api/meetings/meeting/:id
 */
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // --- Authorization Check ---
    const team = await Team.findById(meeting.team);
    if (!team) {
      return res.status(404).json({ message: 'Team not found for this meeting' });
    }
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }
    // --- End Check ---

    logActivity(
      meeting.team,
      req.user.id,
      'MEETING_DELETED',
      `Deleted meeting '${meeting.title}'`
    );

    await meeting.deleteOne();

    res.json({ message: 'Meeting removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

exports.checkTeamMembership = checkTeamMembership;
