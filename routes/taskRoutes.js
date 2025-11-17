const express = require('express');
const router = express.Router();
const {
  getTasksForTeam,
  updateTask,
  checkTeamMembership, // Import the middleware
  createBulkTasks,
  deleteTask,
  generateSubtasks,
  getTaskEstimate
} = require('../controllers/taskController');

const { protect } = require('../middleware/authMiddleware');

// Apply 'protect' middleware to all task routes
router.use(protect);

router.route('/generate-subtasks')
  .post(generateSubtasks);

// Routes for a specific team
router.route('/:teamId')
  .get(checkTeamMembership, getTasksForTeam); // GET /api/tasks/team-id

router.route('/:teamId/bulk')
  .post(checkTeamMembership, createBulkTasks);

// Route for updating a specific task
// Note: team membership check will happen inside updateTask logic if needed,
// but we should add a check here to get the team context.
// A simpler way is to just protect the task ID.
router.route('/task/:taskId')
  .put(updateTask) // PUT /api/tasks/task/task-id
  .delete(checkTeamMembership, deleteTask);

router.route('/estimate').post(protect, getTaskEstimate);

module.exports = router;
