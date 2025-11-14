const express = require('express');
const router = express.Router();
const { getEmailLogs } = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

router.route('/')
  .get(getEmailLogs);

module.exports = router;
