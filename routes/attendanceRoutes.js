const express = require('express');
const router = express.Router();
const {
  getAttendance,
  setAttendance,
  getMembers,
  getAttendanceSummary,
  getAttendanceForDate,
  exportAttendanceData,
  setBulkHoliday
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

router.route('/')
  .get(getAttendance)
  .post(setAttendance);

  router.route('/bulk-holiday')
  .post(setBulkHoliday);

// This re-uses the logic from memberController, but is fine to have here
router.route('/members')
  .get(getMembers);

  router.route('/summary') // <-- 2. ADD ROUTE
  .get(getAttendanceSummary);

  router.route('/date')
  .get(getAttendanceForDate);

  router.route('/export')
  .get(exportAttendanceData);

module.exports = router;
