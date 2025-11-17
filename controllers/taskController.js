const Task = require('../models/Task');
const Team = require('../models/Team');
const TeamNote = require('../models/TeamNote');
const { logActivity } = require('../services/activityService');
const { generateAISubtasks } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// We re-use this check from teamController, but we need to fetch the team
const checkTeamMembership = async (req, res, next) => {
  try {
    let teamId = req.params.teamId;

    if (!teamId) {
      // Check if it's a task route
      if (req.params.taskId) {
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });
        teamId = task.team;
      }
      // Check if it's a teamnote route
      else if (req.params.noteId) {
        const note = await TeamNote.findById(req.params.noteId);
        if (!note) return res.status(404).json({ message: 'Team note not found' });
        teamId = note.team;
      }
    }

    if (!teamId) {
      return res.status(400).json({ message: 'No team or resource ID provided' });
    }

    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // Check if the logged-in user is the OWNER
    if (team.owner.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    // Attach team to request for later use
    req.team = team;
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all tasks for a specific team
exports.getTasksForTeam = async (req, res) => {
  try {
    const tasks = await Task.find({ team: req.params.teamId })
      // No longer need to populate 'assignedTo' or 'createdBy'
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Update a task (e.g., change status)
exports.updateTask = async (req, res) => {
  try {
    const { title, description, status, dueDate, assignedTo } = req.body;
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Check if new assignee is a valid member (if provided)
    if (assignedTo) {
        const team = await Team.findById(task.team);
        if (!team.members.includes(assignedTo)) {
             return res.status(400).json({ message: 'New assigned member is not in the team' });
        }
        task.assignedTo = assignedTo;
    }

    task.title = title || task.title;
    task.description = description || task.description;
    task.status = status || task.status;
    task.dueDate = dueDate || task.dueDate;

    const updatedTask = await task.save();
    logActivity(
  updatedTask.team,
  req.user.id,
  'TASK_UPDATED',
  `Updated task '${updatedTask.title}' (Status: ${updatedTask.status})`
);
res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Create multiple tasks for a single assignee
// @route   POST /api/tasks/:teamId/bulk
exports.createBulkTasks = async (req, res) => {
  try {
    const { assignedTo, tasks } = req.body;
    const team = req.team;

    if (!assignedTo || !team.members.includes(assignedTo)) {
      return res.status(400).json({
        message: `"${assignedTo}" is not a valid member of this team.`
      });
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ message: 'Please provide at least one task.' });
    }

    const tasksToCreate = tasks.map(task => {
      if (!task.title || task.title.trim() === '') {
        // This should be caught by the frontend, but good to have
        throw new Error('All tasks must have a title.');
      }
      return {
        team: req.params.teamId,
        title: task.title,
        description: task.description || '',
        status: 'Pending',
        assignedTo: assignedTo,
        createdBy: req.user.id,
        dueDate: task.dueDate || null,
      };
    });

    const createdTasks = await Task.insertMany(tasksToCreate);
    for (const task of createdTasks) {
  logActivity(
    task.team,
    req.user.id,
    'TASK_CREATED',
    `Created task '${task.title}' for ${task.assignedTo}`
  );
}
res.status(201).json(createdTasks);

  } catch (error) {
    // --- BETTER ERROR HANDLING ---
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation failed', error: error.message });
    }
    // Handle the specific error we might throw
    if (error.message === 'All tasks must have a title.') {
        return res.status(400).json({ message: error.message });
    }

    // Fallback for other errors
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/task/:taskId
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Authorization is handled by the checkTeamMembership middleware
    // We can just delete the task
    logActivity(
  task.team,
  req.user.id,
  'TASK_DELETED',
  `Deleted task '${task.title}'`
);
await task.deleteOne();
    res.json({ message: 'Task removed successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(userId, error, req.originalUrl);
  }
};

/**
 * @desc    Generate sub-tasks from a complex task title using AI
 * @route   POST /api/tasks/generate-subtasks
 */
exports.generateSubtasks = async (req, res) => {
  const { taskTitle } = req.body;

  if (!taskTitle) {
    return res.status(400).json({ message: 'Please provide a task title' });
  }

  try {
    const subtasks = await generateAISubtasks(taskTitle);
    logAiAction(req.user.id, 'AI_GENERATE_SUBTASKS');
    res.json(subtasks);
  } catch (error) {
    console.error('Generate Subtasks Error:', error.message);
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(userId, error, req.originalUrl);
  }
};

// We also need to update the task routes to use the new check
exports.checkTeamMembership = checkTeamMembership;
