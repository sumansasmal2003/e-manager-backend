const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Team = require('../models/Team');
const MemberProfile = require('../models/MemberProfile');
const User = require('../models/User'); // <-- Import User
const { logError } = require('../services/logService');

// --- HELPER: Get list of IDs the user can manage ---
// If Owner: Returns [OwnerID, Manager1ID, Manager2ID...]
// If Manager: Returns [ManagerID]
const getAllowedLeaderIds = async (user) => {
  if (user.role === 'owner') {
    const managers = await User.find({ ownerId: user.id }).distinct('_id');
    return [user.id, ...managers];
  }
  return [user.id];
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

// @desc    Get attendance records for a specific month
// @route   GET /api/attendance?year=2025&month=10
exports.getAttendance = async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }

    const allowedIds = await getAllowedLeaderIds(req.user);

    // Calculate start and end dates for the query
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, parseInt(month) + 1, 1);

    const records = await Attendance.find({
      leader: { $in: allowedIds }, // Fetch records for ANY allowed leader
      date: { $gte: startDate, $lt: endDate },
    });

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
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

    // Ensure the date is set to the start of the day in UTC
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    // "Upsert": Find one record and update it, or create it if it doesn't exist.
    // Note: We save it under req.user.id (the person performing the action).
    // The 'getAttendance' query uses $in: allowedIds so the Owner will see it regardless.
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
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Get all unique members for the leader with their profile dates
// @route   GET /api/attendance/members
exports.getMembers = async (req, res) => {
  try {
    const allowedIds = await getAllowedLeaderIds(req.user);

    // 1. Get all unique member names from teams owned by allowed leaders
    const teams = await Team.find({ owner: { $in: allowedIds } }).select('members');
    const memberSet = new Set();
    teams.forEach(team => {
      team.members.forEach(member => {
        memberSet.add(member);
      });
    });
    const uniqueMemberNames = [...memberSet].sort();

    // 2. Fetch all profiles for these members (scoped to allowed leaders)
    const profiles = await MemberProfile.find({
      leader: { $in: allowedIds },
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
    logError(req.user.id, error, req.originalUrl);
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

    const allowedIds = await getAllowedLeaderIds(req.user);
    // Convert IDs to ObjectIds for aggregation pipeline
    const objectIds = allowedIds.map(id => new mongoose.Types.ObjectId(id));

    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, parseInt(month) + 1, 1));

    // Use an aggregation pipeline to group by date and count statuses
    const summary = await Attendance.aggregate([
      {
        $match: {
          leader: { $in: objectIds },
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
    logError(req.user.id, error, req.originalUrl);
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

    const allowedIds = await getAllowedLeaderIds(req.user);

    // Create a date object from the query string
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const records = await Attendance.find({
      leader: { $in: allowedIds },
      date: targetDate,
    });

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
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

    const allowedIds = await getAllowedLeaderIds(req.user);

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
      // If no members specified, get all unique members from allowed teams
      const teams = await Team.find({ owner: { $in: allowedIds } }).select('members');
      const memberSet = new Set();
      teams.forEach(team => team.members.forEach(member => memberSet.add(member)));
      memberNames = [...memberSet];
    }

    // 2. Fetch all profiles for these members (scoped)
    const profiles = await MemberProfile.find({
      leader: { $in: allowedIds },
      name: { $in: memberNames }
    }).select('name joiningDate endingDate');

    // 3. Create a Map of profiles for fast lookup
    const profileMap = new Map();
    profiles.forEach(p => profileMap.set(p.name, p));

    // 4. Build the query for existing records
    const query = {
      leader: { $in: allowedIds },
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

        // Apply Profile Date Logic
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
          const endDateProfile = new Date(profile.endingDate);
          endDateProfile.setUTCHours(0, 0, 0, 0);
          if (currentDate > endDateProfile) {
            continue; // Skip this day; member has already left
          }
        }

        // If we're here, the member was active on this day.
        const key = `${dateKey}|${member}`;
        const status = recordMap.get(key) || 'Not Recorded';

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
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Set a specific date as 'Holiday' for all members
// @route   POST /api/attendance/bulk-holiday
exports.setBulkHoliday = async (req, res) => {
  const { date } = req.body;

  if (!date) {
    return res.status(400).json({ message: 'Date is required' });
  }

  try {
    const allowedIds = await getAllowedLeaderIds(req.user);

    // 1. Find all members in scope
    const teams = await Team.find({ owner: { $in: allowedIds } }).select('members');
    const memberSet = new Set();
    teams.forEach(team => {
      team.members.forEach(member => {
        memberSet.add(member);
      });
    });
    const uniqueMemberNames = [...memberSet];

    if (uniqueMemberNames.length === 0) {
      return res.status(200).json({ message: 'No members to update' });
    }

    // 2. Create the target date (start of day UTC)
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    // 3. Create an array of "upsert" operations
    const operations = uniqueMemberNames.map(memberName => ({
      updateOne: {
        filter: {
          leader: req.user.id, // Log holiday under the current user
          member: memberName,
          date: targetDate,
        },
        update: {
          $set: { status: 'Holiday' },
        },
        upsert: true,
      },
    }));

    // 4. Execute all operations
    const result = await Attendance.bulkWrite(operations);

    res.json({
      message: 'Holiday set for all members',
      matched: result.matchedCount,
      modified: result.modifiedCount,
      upserted: result.upsertedCount,
    });
  } catch (error) {
    console.error('Bulk Holiday Set Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};
