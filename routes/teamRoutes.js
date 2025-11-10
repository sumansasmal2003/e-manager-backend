const express = require('express');
const router = express.Router();
const {
  createTeam,
  getMyTeams,
  addTeamMember,
  getTeamById,
  deleteTeam,
  addFigmaLink,     // <-- ADD THIS
  deleteFigmaLink,
  addGithubRepo,     // <-- ADD THIS
  deleteGithubRepo
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

router.route('/:id/figma')
  .post(addFigmaLink); // POST /api/teams/some-team-id/figma

router.route('/:id/figma/:linkId')
  .delete(deleteFigmaLink);

router.route('/:id/github')
  .post(addGithubRepo); // POST /api/teams/some-team-id/github

router.route('/:id/github/:repoId')
  .delete(deleteGithubRepo);

module.exports = router;
