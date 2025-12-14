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
    if (!year || !month) return res.status(400).json({ message: 'Year and month required' });

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, parseInt(month) + 1, 1);

    let query = { date: { $gte: startDate, $lt: endDate } };

    if (req.user.role === 'employee') {
      // Employee: See ONLY their own records
      query.member = req.user.username;
    }
    else if (req.user.role === 'manager') {
      // Manager: See records for THEIR members AND THEMSELVES
      const teams = await Team.find({ owner: req.user._id }).select('members');

      const memberNames = [];
      teams.forEach(t => {
        if (t.members && Array.isArray(t.members)) {
          memberNames.push(...t.members);
        }
      });

      // FIX: Add Manager's own name to the list so they see their own rows
      memberNames.push(req.user.username);

      query.member = { $in: memberNames };
    }
    else {
      // Owner: See records marked by themselves or their managers
      const allowedIds = await getAllowedLeaderIds(req.user);
      query.leader = { $in: allowedIds };
    }

    const records = await Attendance.find(query);
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Set (create or update) an attendance record
exports.setAttendance = async (req, res) => {
  try {
    // 1. Employee Restriction
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Restricted' });
    }

    const { date, member, status } = req.body;
    if (!date || !member || !status) return res.status(400).json({ message: 'Missing fields' });

    // 2. Manager Restriction: Cannot mark own attendance
    if (req.user.role === 'manager') {
        if (req.user.permissions.canMarkAttendance === false) {
             return res.status(403).json({ message: 'Restricted: You do not have permission to mark attendance.' });
        }
        if (member === req.user.username) {
             return res.status(403).json({ message: 'Managers cannot mark their own attendance. Contact the Owner.' });
        }
    }

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const record = await Attendance.findOneAndUpdate(
      { leader: req.user.id, member: member, date: targetDate },
      { status: status },
      { new: true, upsert: true }
    );

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Get members for the grid
exports.getMembers = async (req, res) => {
  try {
    // 1. Employee View
    if (req.user.role === 'employee') {
      const profile = await MemberProfile.findOne({ name: req.user.username });
      return res.json([{
        name: req.user.username,
        joiningDate: profile ? profile.joiningDate : req.user.createdAt,
        endingDate: profile ? profile.endingDate : null,
        email: req.user.email,
        role: 'employee'
      }]);
    }

    const allowedIds = await getAllowedLeaderIds(req.user);
    const teams = await Team.find({ owner: { $in: allowedIds } }).select('members');
    const memberSet = new Set();
    teams.forEach(team => {
      team.members.forEach(member => memberSet.add(member));
    });

    const managerList = [];

    // 2. If Owner, Include Managers
    if (req.user.role === 'owner') {
        const managers = await User.find({ ownerId: req.user._id, role: 'manager' });
        managers.forEach(mgr => {
            if (!memberSet.has(mgr.username)) {
                managerList.push({
                    name: mgr.username,
                    joiningDate: mgr.createdAt,
                    endingDate: !mgr.isActive ? new Date() : null,
                    email: mgr.email,
                    role: 'manager'
                });
            }
        });
    }

    // 3. FIX: If Manager, Include Self (so they show up in the grid)
    if (req.user.role === 'manager') {
         // Ensure manager isn't already in the set (unlikely but safe)
         if (!memberSet.has(req.user.username)) {
             managerList.push({
                 name: req.user.username,
                 joiningDate: req.user.createdAt,
                 endingDate: null,
                 email: req.user.email,
                 role: 'manager' // Tag as manager so frontend can block self-edit
             });
         }
    }

    const uniqueMemberNames = [...memberSet].sort();

    const profiles = await MemberProfile.find({
      leader: { $in: allowedIds },
      name: { $in: uniqueMemberNames }
    }).select('name joiningDate endingDate email');

    const profileMap = new Map();
    profiles.forEach(profile => profileMap.set(profile.name, profile));

    const membersWithProfiles = uniqueMemberNames.map(name => {
      const profile = profileMap.get(name);
      return {
        name: name,
        joiningDate: profile ? profile.joiningDate : null,
        endingDate: profile ? profile.endingDate : null,
        email: profile ? profile.email : '',
        role: 'member'
      };
    });

    // Combine Members + Managers (and Self)
    const finalResult = [...membersWithProfiles, ...managerList].sort((a, b) => a.name.localeCompare(b.name));

    res.json(finalResult);
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
    if (!year || !month) return res.status(400).json({ message: 'Required fields missing' });

    let matchQuery = {
      date: {
        $gte: new Date(Date.UTC(year, month, 1)),
        $lt: new Date(Date.UTC(year, parseInt(month) + 1, 1))
      }
    };

    if (req.user.role === 'employee') {
      matchQuery.member = req.user.username;
    } else {
      const allowedIds = await getAllowedLeaderIds(req.user);
      const objectIds = allowedIds.map(id => new mongoose.Types.ObjectId(id));
      matchQuery.leader = { $in: objectIds };
    }

    const summary = await Attendance.aggregate([
      { $match: matchQuery },
      { $group: { _id: '$date', statuses: { $push: '$status' } } },
      { $project: { _id: 0, date: '$_id', statuses: 1 } },
    ]);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.getAttendanceForDate = async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ message: 'Date required' });
        const targetDate = new Date(date); targetDate.setUTCHours(0,0,0,0);

        let query = { date: targetDate };
        if (req.user.role === 'employee') {
            query.member = req.user.username;
        } else {
            const allowedIds = await getAllowedLeaderIds(req.user);
            query.leader = { $in: allowedIds };
        }
        const records = await Attendance.find(query);
        res.json(records);
    } catch(e) { res.status(500).json({message: 'Error'}); }
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
  try {
    if (req.user.role === 'employee') return res.status(403).json({ message: 'Restricted' });

    // NEW: Manager Check
    if (req.user.role === 'manager' && req.user.permissions.canMarkAttendance === false) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to mark attendance.' });
    }

    const { date } = req.body;
    if (!date) return res.status(400).json({ message: 'Date required' });

    const allowedIds = await getAllowedLeaderIds(req.user);
    const teams = await Team.find({ owner: { $in: allowedIds } }).select('members');
    const memberSet = new Set();
    teams.forEach(team => { team.members.forEach(member => { memberSet.add(member); }); });
    const uniqueMemberNames = [...memberSet];

    if (uniqueMemberNames.length === 0) return res.status(200).json({ message: 'No members' });

    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const operations = uniqueMemberNames.map(memberName => ({
      updateOne: {
        filter: { leader: req.user.id, member: memberName, date: targetDate },
        update: { $set: { status: 'Holiday' } },
        upsert: true,
      },
    }));

    await Attendance.bulkWrite(operations);
    res.json({ message: 'Holiday set' });
  } catch(e) { res.status(500).json({message:'Error'}); }
};
