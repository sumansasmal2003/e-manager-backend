const express = require('express');
const router = express.Router();
const {
  getTeamNotesForTeam,
  createTeamNote,
  updateTeamNote,
  deleteTeamNote,
} = require('../controllers/teamNoteController');

const { protect } = require('../middleware/authMiddleware');
// Import the middleware from taskController
const { checkTeamMembership } = require('../controllers/taskController');

// Apply 'protect' middleware to all routes
router.use(protect);

// Routes for getting/creating notes (requires a teamId)
router.route('/:teamId')
  .get(checkTeamMembership, getTeamNotesForTeam)   // GET /api/teamnotes/team-id
  .post(checkTeamMembership, createTeamNote);  // POST /api/teamnotes/team-id

// Routes for updating/deleting a specific note (requires noteId)
// We use checkTeamMembership, which will find the team via the note's task ID
// (Note: We must update checkTeamMembership to handle noteId)

// --- IMPORTANT ---
// Let's create a new middleware for notes, as checkTeamMembership is for tasks
// For simplicity, let's just do the check inside the controller.
// We'll update the `taskController` middleware to be more generic.

// --- GOAL ---
// We need a middleware that can get a teamId from:
// 1. req.params.teamId
// 2. req.params.taskId -> find Task -> get task.team
// 3. req.params.noteId -> find TeamNote -> get note.team

// Let's update `controllers/taskController.js`'s `checkTeamMembership`
// (See Step 4)

// --- After Step 4, this is the final routes/teamNoteRoutes.js ---
router.route('/:teamId')
  .get(checkTeamMembership, getTeamNotesForTeam)
  .post(checkTeamMembership, createTeamNote);

router.route('/note/:noteId')
  .put(checkTeamMembership, updateTeamNote)    // PUT /api/teamnotes/note/note-id
  .delete(checkTeamMembership, deleteTeamNote); // DELETE /api/teamnotes/note/note-id

module.exports = router;
