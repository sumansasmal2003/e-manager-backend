const Task = require('../models/Task');
const Team = require('../models/Team');
const TeamNote = require('../models/TeamNote');
const User = require('../models/User'); // <-- Don't forget to import User
const { logActivity } = require('../services/activityService');
const { generateAISubtasks, generateTaskEstimate } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// --- HELPER: Shared Access Logic (Same as in teamController) ---
const hasTeamAccess = async (team, user) => {
  // 1. If user is the direct owner of the team
  if (team.owner.toString() === user.id) {
    return true;
  }

  // 2. If user is an 'owner' (Super Admin)
  if (user.role === 'owner') {
    // Fetch the team owner's details
    const teamOwner = await User.findById(team.owner);
    // Check if the team owner reports to this User (the Owner)
    if (teamOwner && teamOwner.ownerId && teamOwner.ownerId.toString() === user.id) {
      return true;
    }
  }

  return false;
};

// --- MIDDLEWARE: Check Team Membership ---
// This is used by Tasks, Meetings, and Team Notes routes
const checkTeamMembership = async (req, res, next) => {
  try {
    let teamId = req.params.teamId;

    // If no teamId in params, try to find it via the resource ID
    if (!teamId) {
      if (req.params.taskId) {
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });
        teamId = task.team;
      }
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

    // --- NEW: Use the Helper to check access ---
    const isAuthorized = await hasTeamAccess(team, req.user);
    if (!isAuthorized) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    // Attach team to request for the next controller to use
    req.team = team;
    next();
  } catch (error) {
    console.error('Check Team Membership Error:', error);
    return res.status(500).json({ message: 'Server Error during authorization check' });
  }
};

// @desc    Get all tasks for a specific team
exports.getTasksForTeam = async (req, res) => {
  try {
    const tasks = await Task.find({ team: req.params.teamId })
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Update a task (e.g., change status)
exports.updateTask = async (req, res) => {
  try {
    const { title, description, status, dueDate, assignedTo } = req.body;
    const task = await Task.findById(req.params.taskId);

    // Note: checkTeamMembership already ran before this,
    // so we know the user has access to this task's team.

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
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Create multiple tasks for a single assignee
// @route   POST /api/tasks/:teamId/bulk
exports.createBulkTasks = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canCreateTasks) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to create tasks.' });
    }
    const { assignedTo, tasks } = req.body;
    const team = req.team; // From middleware

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
        throw new Error('All tasks must have a title.');
      }
      return {
        team: req.params.teamId,
        title: task.title,
        description: task.description || '',
        status: 'Pending',
        assignedTo: assignedTo,
        createdBy: req.user.id, // The Owner or Manager ID
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
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation failed', error: error.message });
    }
    if (error.message === 'All tasks must have a title.') {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/task/:taskId
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    // --- PERMISSION CHECK ---
    if (req.user.role === 'manager' && !req.user.permissions.canDeleteTasks) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to delete tasks.' });
    }
    // ------------------------

    logActivity(task.team, req.user.id, 'TASK_DELETED', `Deleted task '${task.title}'`);
    await task.deleteOne();
    res.json({ message: 'Task removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
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
    logError(req.user.id, error, req.originalUrl);
  }
};

/**
 * @desc    Generate an AI-powered time estimate for a new task
 * @route   POST /api/tasks/estimate
 */
exports.getTaskEstimate = async (req, res) => {
  const { title, teamId } = req.body;
  const timezone = req.body.timezone || 'UTC';

  if (!title || !teamId) {
    return res.status(400).json({ message: 'Task title and teamId are required' });
  }

  try {
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    // --- NEW: Use Helper to check access ---
    const isAuthorized = await hasTeamAccess(team, req.user);
    if (!isAuthorized) {
      return res.status(401).json({ message: 'Not authorized for this team' });
    }

    const estimate = await generateTaskEstimate(title, teamId, timezone);
    logAiAction(req.user.id, 'AI_TASK_ESTIMATE');
    res.json(estimate);

  } catch (error) {
    console.error('Get Task Estimate Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

exports.checkTeamMembership = checkTeamMembership;
