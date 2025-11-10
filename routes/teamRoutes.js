const express = require('express');
const router = express.Router();
const {
  createTeam,
  getMyTeams,
  addTeamMember,
  getTeamById,
  deleteTeam
} = require('../controllers/teamController');

const { protect } = require('../middleware/authMiddleware');

// All these routes are protected
router.use(protect);

router.route('/')
  .post(createTeam)  // POST /api/teams
  .get(getMyTeams);   // GET /api/teams

  router.route('/:id')
  .get(getTeamById);

  router.route('/:id')
  .get(getTeamById)
  .delete(deleteTeam);

router.route('/:id/add')
  .put(addTeamMember); // PUT /api/teams/some-team-id/add

module.exports = router;
