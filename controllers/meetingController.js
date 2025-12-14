const Meeting = require('../models/Meeting');
const { checkTeamMembership } = require('./taskController'); // Use shared check
const axios = require('axios');
const { logActivity } = require('../services/activityService');
const Team = require('../models/Team');
const { getGoogleCalendarClient } = require('../services/googleCalendarService');
const User = require('../models/User');
const { logError } = require('../services/logService');

// --- HELPER: Shared Access Logic (Reused from TeamController) ---
const hasTeamAccess = async (teamId, user) => {
  try {
    const userId = user._id;
    // 1. Direct Check
    const isLinked = await Team.exists({
      _id: teamId,
      $or: [ { owner: userId }, { employees: userId }, { members: user.username } ]
    });
    if (isLinked) return true;

    // 2. Owner Hierarchy Check
    if (user.role === 'owner') {
      const team = await Team.findById(teamId).select('owner');
      if (!team) return false;
      const teamOwner = await User.findById(team.owner).select('ownerId');
      if (teamOwner && teamOwner.ownerId && teamOwner.ownerId.toString() === userId.toString()) return true;
    }
    return false;
  } catch (err) { return false; }
};

// Helper function to get Zoom Access Token
const getZoomAccessToken = async () => {
  try {
    const authUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`;
    const base64Creds = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
    ).toString('base64');

    const { data } = await axios.post(authUrl, {}, {
      headers: { 'Authorization': `Basic ${base64Creds}` },
    });
    return data.access_token;
  } catch (error) {
    console.error('Error getting Zoom access token:', error.response ? error.response.data : error.message);
    throw new Error('Zoom auth failed');
  }
};

exports.createZoomLink = async (title, meetingTimeISO, timezone) => {
  try {
    const accessToken = await getZoomAccessToken();
    const zoomApiUrl = 'https://api.zoom.us/v2/users/me/meetings';
    const formattedStartTime = meetingTimeISO.split('.')[0] + "Z";

    const meetingDetails = {
      topic: title || 'New E-Manager Meeting',
      type: 2,
      start_time: formattedStartTime,
      duration: 60,
      timezone: timezone || 'UTC',
      settings: { join_before_host: true, mute_upon_entry: true },
    };

    const { data } = await axios.post(zoomApiUrl, meetingDetails, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    return data.join_url;
  } catch (error) {
    console.error('Error creating Zoom meeting:', error.response ? error.response.data : error.message);
    throw new Error('Failed to create Zoom meeting.');
  }
};

exports.generateZoomMeeting = async (req, res) => {
  const { title, meetingTime, timezone } = req.body;
  try {
    const join_url = await exports.createZoomLink(title, meetingTime, timezone);
    res.json({ join_url });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to create Zoom meeting.' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Schedule a new meeting
exports.scheduleMeeting = async (req, res) => {
  try {
    // Permission Check
    if (req.user.role === 'employee') return res.status(403).json({ message: 'Employees cannot schedule meetings.' });
    if (req.user.role === 'manager' && !req.user.permissions.canCreateMeetings) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to schedule meetings.' });
    }

    const { title, agenda, meetingTime, meetingLink, participants } = req.body;
    const team = req.team; // From checkTeamMembership middleware

    let finalParticipants = [];
    if (!participants || participants.length === 0) {
      finalParticipants = team.members;
    } else {
      for (const name of participants) {
        if (!team.members.includes(name)) {
          return res.status(400).json({ message: `Participant "${name}" is not in this team.` });
        }
      }
      finalParticipants = participants;
    }

    const meeting = new Meeting({
      team: req.params.teamId,
      title, agenda, meetingTime, meetingLink,
      createdBy: req.user.id,
      participants: finalParticipants,
    });

    const createdMeeting = await meeting.save();
    logActivity(createdMeeting.team, req.user.id, 'MEETING_SCHEDULED', `Scheduled meeting '${createdMeeting.title}'`);

    // Google Calendar Sync
    try {
      const user = await User.findById(req.user.id).select('+googleAccessToken +googleRefreshToken');
      if (user.googleCalendarConnected) {
        const calendar = await getGoogleCalendarClient(user);
        const startTime = new Date(meetingTime);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        await calendar.events.insert({
          calendarId: 'primary',
          resource: {
            summary: title,
            description: agenda,
            start: { dateTime: startTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            end: { dateTime: endTime.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          },
        });
      }
    } catch (gcalError) {
      console.error('Failed to push event to Google Calendar:', gcalError.message);
    }

    res.status(201).json(createdMeeting);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Get all upcoming meetings
exports.getMeetingsForTeam = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      team: req.params.teamId,
      meetingTime: { $gte: new Date() }
    }).sort({ meetingTime: 1 });
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Update a meeting
exports.updateMeeting = async (req, res) => {
  try {
    const { title, agenda, meetingTime, meetingLink, participants } = req.body;
    const meeting = await Meeting.findById(req.params.id);

    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    // --- FIX: Access Control ---
    if (req.user.role === 'employee') return res.status(403).json({ message: 'Employees cannot update meetings.' });

    // Check if user has access to the team (Owner OR Manager)
    if (!(await hasTeamAccess(meeting.team, req.user))) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    meeting.title = title || meeting.title;
    meeting.agenda = agenda || meeting.agenda;
    meeting.meetingLink = meetingLink || meeting.meetingLink;
    if (participants) meeting.participants = participants;
    if (meetingTime) meeting.meetingTime = meetingTime;

    const updatedMeeting = await meeting.save();
    logActivity(updatedMeeting.team, req.user.id, 'MEETING_UPDATED', `Updated meeting '${updatedMeeting.title}'`);
    res.json(updatedMeeting);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a meeting
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    // --- FIX: Permission Check ---
    if (req.user.role === 'employee') return res.status(403).json({ message: 'Employees cannot delete meetings.' });
    if (req.user.role === 'manager' && !req.user.permissions.canDeleteMeetings) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to delete meetings.' });
    }

    // --- FIX: Access Check ---
    if (!(await hasTeamAccess(meeting.team, req.user))) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    logActivity(meeting.team, req.user.id, 'MEETING_DELETED', `Deleted meeting '${meeting.title}'`);
    await meeting.deleteOne();
    res.json({ message: 'Meeting removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

exports.checkTeamMembership = checkTeamMembership;
