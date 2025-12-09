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
  deleteGithubRepo,
  removeTeamMember,
  generateTeamReport,
  addLiveProject,
  deleteLiveProject
} = require('../controllers/teamController');

const { protect } = require('../middleware/authMiddleware');
const { checkTeamLimit, checkMemberLimit } = require('../middleware/subscriptionMiddleware');

// All these routes are protected
router.use(protect);

router.route('/')
  .post(checkTeamLimit, createTeam)  // POST /api/teams
  .get(getMyTeams);   // GET /api/teams

  router.route('/:id')
  .get(getTeamById);

  router.route('/:id')
  .get(getTeamById)
  .delete(deleteTeam);

router.route('/:id/add')
  .put(checkMemberLimit, addTeamMember); // PUT /api/teams/some-team-id/add

  router.route('/:id/remove')
  .put(removeTeamMember);

router.route('/:id/figma')
  .post(addFigmaLink); // POST /api/teams/some-team-id/figma

router.route('/:id/figma/:linkId')
  .delete(deleteFigmaLink);

router.route('/:id/github')
  .post(addGithubRepo); // POST /api/teams/some-team-id/github

router.route('/:id/github/:repoId')
  .delete(deleteGithubRepo);

  router.route('/:id/generate-report')
  .post(generateTeamReport);

router.route('/:id/liveproject')
  .post(addLiveProject); // POST /api/teams/some-team-id/liveproject

router.route('/:id/liveproject/:linkId')
  .delete(deleteLiveProject);

module.exports = router;
