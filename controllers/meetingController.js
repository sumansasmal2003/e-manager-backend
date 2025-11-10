const Meeting = require('../models/Meeting');
const { checkTeamMembership } = require('./taskController'); // Use shared check

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
