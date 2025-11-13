const express = require('express');
const router = express.Router();
const {
  scheduleMeeting,
  getMeetingsForTeam,
  checkTeamMembership, // Import the shared middleware
  generateZoomMeeting,
  updateMeeting,     // <-- IMPORT
  deleteMeeting,
} = require('../controllers/meetingController');

const { protect } = require('../middleware/authMiddleware');

// Apply 'protect' middleware to all meeting routes
router.use(protect);

router.route('/generate-zoom')
  .post(generateZoomMeeting);

  router.route('/meeting/:id')
  .put(updateMeeting)
  .delete(deleteMeeting);

// Apply team membership check to all routes for /:teamId
router.use('/:teamId', checkTeamMembership);

// Routes for a specific team
router.route('/:teamId')
  .post(scheduleMeeting) // POST /api/meetings/team-id
  .get(getMeetingsForTeam); // GET /api/meetings/team-id

module.exports = router;
