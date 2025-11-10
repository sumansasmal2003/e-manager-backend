const express = require('express');
const router = express.Router();
const { getCalendarEvents } = require('../controllers/calendarController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes in this file
router.use(protect);

router.route('/')
  .get(getCalendarEvents);

module.exports = router;
