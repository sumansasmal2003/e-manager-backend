const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Team = require('../models/Team');
const MemberProfile = require('../models/MemberProfile');

// @desc    Get attendance records for a specific month
// @route   GET /api/attendance?year=2025&month=10 (0-indexed month)
exports.getAttendance = async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }

    // Calculate start and end dates for the query
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, parseInt(month) + 1, 1);

    const records = await Attendance.find({
      leader: req.user.id,
      date: { $gte: startDate, $lt: endDate },
    });

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Set (create or update) an attendance record
// @route   POST /api/attendance
exports.setAttendance = async (req, res) => {
  try {
    const { date, member, status } = req.body;

    if (!date || !member || !status) {
      return res.status(400).json({ message: 'Date, member, and status are required' });
    }

    // Ensure the date is set to the start of the day in UTC for consistent storage
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    // "Upsert": Find one record and update it, or create it if it doesn't exist.
    const record = await Attendance.findOneAndUpdate(
      {
        leader: req.user.id,
        member: member,
        date: targetDate,
      },
      {
        status: status,
      },
      {
        new: true, // Return the new/updated document
        upsert: true, // Create it if it doesn't exist
      }
    );

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get all unique members for the leader with their profile dates
// @route   GET /api/attendance/members
exports.getMembers = async (req, res) => {
  try {
    // 1. Get all unique member names
    const teams = await Team.find({ owner: req.user.id }).select('members');
    const memberSet = new Set();
    teams.forEach(team => {
      team.members.forEach(member => {
        memberSet.add(member);
      });
    });
    const uniqueMemberNames = [...memberSet].sort();

    // 2. Fetch all profiles for these members
    const profiles = await MemberProfile.find({
      leader: req.user.id,
      name: { $in: uniqueMemberNames }
    }).select('name joiningDate endingDate email');

    // 3. Create a map of profiles for easy lookup
    const profileMap = new Map();
    profiles.forEach(profile => {
      profileMap.set(profile.name, profile);
    });

    // 4. Combine names with profiles
    const membersWithProfiles = uniqueMemberNames.map(name => {
      const profile = profileMap.get(name);
      return {
        name: name,
        joiningDate: profile ? profile.joiningDate : null,
        endingDate: profile ? profile.endingDate : null,
        email: profile ? profile.email : '',
      };
    });

    res.json(membersWithProfiles);
  } catch (error) {
    console.error('Error in getMembers:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get attendance summary for a month (for calendar events)
// @route   GET /api/attendance/summary?year=2025&month=10
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }

    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, parseInt(month) + 1, 1));

    // Use an aggregation pipeline to group by date and count statuses
    const summary = await Attendance.aggregate([
      {
        $match: {
          leader: new mongoose.Types.ObjectId(req.user.id),
          date: { $gte: startDate, $lt: endDate },
        },
      },
      {
        $group: {
          _id: '$date', // Group by the date
          statuses: {
            $push: '$status', // Push each status into an array
          },
        },
      },
      {
        $project: {
          _id: 0, // Don't include the _id field
          date: '$_id',
          statuses: 1, // Include the statuses array
        },
      },
    ]);

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Get attendance records for a specific date
// @route   GET /api/attendance/date?date=2025-11-12
exports.getAttendanceForDate = async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    // Create a date object from the query string
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const records = await Attendance.find({
      leader: req.user.id,
      date: targetDate,
    });

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Export attendance records based on filters
// @route   GET /api/attendance/export?startDate=...&endDate=...&members=...
exports.exportAttendanceData = async (req, res) => {
  try {
    let { startDate, endDate, members } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0); // Normalize start date
    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999); // Normalize end date

    // 1. Determine which members to filter for
    let memberNames;
    if (Array.isArray(members)) {
      memberNames = members;
    } else if (typeof members === 'string') {
      memberNames = [members];
    } else {
      const teams = await Team.find({ owner: req.user.id }).select('members');
      const memberSet = new Set();
      teams.forEach(team => team.members.forEach(member => memberSet.add(member)));
      memberNames = [...memberSet];
    }

    // --- NEW: Fetch Member Profiles ---
    // 2. Fetch all profiles for these members
    const profiles = await MemberProfile.find({
      leader: req.user.id,
      name: { $in: memberNames }
    }).select('name joiningDate endingDate');

    // 3. Create a Map of profiles for fast lookup
    const profileMap = new Map();
    profiles.forEach(p => profileMap.set(p.name, p));

    // 4. Build the query for existing records
    const query = {
      leader: req.user.id,
      date: { $gte: start, $lte: end },
      member: { $in: memberNames }
    };

    // 5. Fetch all existing records
    const records = await Attendance.find(query).select('date member status');

    // 6. Create a Map for fast lookup
    const recordMap = new Map();
    records.forEach(record => {
      const dateKey = format(new Date(record.date), 'yyyy-MM-dd');
      const key = `${dateKey}|${record.member}`;
      recordMap.set(key, record.status);
    });

    // 7. Build the complete report
    const fullReport = [];

    // Loop from start date to end date
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = format(new Date(d), 'yyyy-MM-dd');
      const currentDate = new Date(d);
      currentDate.setUTCHours(0, 0, 0, 0); // Normalize current loop date

      // Loop through each member
      for (const member of memberNames) {

        // --- NEW: Apply Profile Date Logic ---
        const profile = profileMap.get(member);

        // Check joining date
        if (profile && profile.joiningDate) {
          const joinDate = new Date(profile.joiningDate);
          joinDate.setUTCHours(0, 0, 0, 0);
          if (currentDate < joinDate) {
            continue; // Skip this day; member hadn't joined yet
          }
        }

        // Check ending date
        if (profile && profile.endingDate) {
          const endDate = new Date(profile.endingDate);
          endDate.setUTCHours(0, 0, 0, 0);
          if (currentDate > endDate) {
            continue; // Skip this day; member has already left
          }
        }
        // --- END NEW LOGIC ---

        // If we're here, the member was active on this day.
        // Add them to the report.
        const key = `${dateKey}|${member}`;
        const status = recordMap.get(key) || 'Not Recorded'; // Default to 'Present'

        fullReport.push({
          date: new Date(d), // Keep as Date object for sorting
          member: member,
          status: status
        });
      }
    }

    // 8. Sort the final report
    const sortedReport = fullReport.sort((a, b) => {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      if (a.member < b.member) return -1;
      if (a.member > b.member) return 1;
      return 0;
    });

    res.json(sortedReport);
  } catch (error) {
    console.error('Export error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Helper function to format date (to avoid issues with timezones)
const format = (date, formatStr) => {
  const d = new Date(date);
  // Use UTC functions to be consistent with how we store dates
  const year = d.getUTCFullYear();
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return formatStr.replace('yyyy', year).replace('MM', month).replace('dd', day);
};
