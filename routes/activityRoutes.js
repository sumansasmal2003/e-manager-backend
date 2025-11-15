const express = require('express');
const router = express.Router();
const { getActivityForTeam, getAllActivityForTeam } = require('../controllers/activityController');

const { protect } = require('../middleware/authMiddleware');
const { checkTeamMembership } = require('../controllers/taskController');

// Protect all routes
router.use(protect);

// Use checkTeamMembership to ensure only the owner can view activity
router.route('/:teamId')
  .get(checkTeamMembership, getActivityForTeam); // GET /api/activity/team-id

  router.route('/:teamId/all')
  .get(checkTeamMembership, getAllActivityForTeam);

module.exports = router;
