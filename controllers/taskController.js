const Task = require('../models/Task');
const Team = require('../models/Team');
const TeamNote = require('../models/TeamNote');
const User = require('../models/User');
const { logActivity } = require('../services/activityService');
const { generateAISubtasks, generateTaskEstimate } = require('../services/reportService');
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');

// --- HELPER: Shared Access Logic ---
const hasTeamAccess = async (team, user) => {
  try {
    const userId = user._id.toString();
    const teamOwnerId = team.owner && team.owner._id ? team.owner._id.toString() : team.owner.toString();

    if (teamOwnerId === userId) return true;

    if (user.role === 'owner') {
      let currentTeamOwner = team.owner;
      if (!currentTeamOwner.ownerId && !currentTeamOwner.role) {
         currentTeamOwner = await User.findById(team.owner);
      }
      if (currentTeamOwner && currentTeamOwner.ownerId && currentTeamOwner.ownerId.toString() === userId) {
        return true;
      }
    }

    if (user.role === 'employee') {
      if (team.employees && team.employees.length > 0) {
        const employeeIds = team.employees.map(id => id.toString());
        if (employeeIds.includes(userId)) return true;
      }
      if (team.members && team.members.includes(user.username)) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error("TaskController Access Check Error:", err);
    return false;
  }
};

// --- MIDDLEWARE: Check Team Membership ---
const checkTeamMembership = async (req, res, next) => {
  try {
    let teamId = req.params.teamId;
    if (!teamId) {
      if (req.params.taskId) {
        const task = await Task.findById(req.params.taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });
        teamId = task.team;
      } else if (req.params.noteId) {
        const note = await TeamNote.findById(req.params.noteId);
        if (!note) return res.status(404).json({ message: 'Team note not found' });
        teamId = note.team;
      }
    }

    if (!teamId) return res.status(400).json({ message: 'No team or resource ID provided' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ message: 'Team not found' });

    const isAuthorized = await hasTeamAccess(team, req.user);
    if (!isAuthorized) return res.status(401).json({ message: 'Not authorized for this team' });

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
    const tasks = await Task.find({ team: req.params.teamId }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Update a task (e.g., change status)
exports.updateTask = async (req, res) => {
  try {
    // --- PERMISSION CHECK: Edit Tasks ---
    if (req.user.role === 'manager' && !req.user.permissions.canEditTasks) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to edit tasks.' });
    }

    const { title, description, status, dueDate, assignedTo } = req.body;
    const task = await Task.findById(req.params.taskId);

    if (!task) return res.status(404).json({ message: 'Task not found' });

    // Note: checkTeamMembership already authorized access to the *team*
    // but we added the specific edit permission check above.

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
    logActivity(updatedTask.team, req.user.id, 'TASK_UPDATED', `Updated task '${updatedTask.title}' (Status: ${updatedTask.status})`);
    res.json(updatedTask);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Create multiple tasks
exports.createBulkTasks = async (req, res) => {
  try {
    if (req.user.role === 'manager' && !req.user.permissions.canCreateTasks) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to create tasks.' });
    }
    if (req.user.role === 'employee') {
      return res.status(403).json({ message: 'Employees cannot create tasks.' });
    }

    const { assignedTo, tasks } = req.body;
    const team = req.team;

    if (!assignedTo || !team.members.includes(assignedTo)) {
      return res.status(400).json({ message: `"${assignedTo}" is not a valid member of this team.` });
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
        createdBy: req.user.id,
        dueDate: task.dueDate || null,
      };
    });

    const createdTasks = await Task.insertMany(tasksToCreate);
    for (const task of createdTasks) {
      logActivity(task.team, req.user.id, 'TASK_CREATED', `Created task '${task.title}' for ${task.assignedTo}`);
    }
    res.status(201).json(createdTasks);

  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ message: 'Validation failed', error: error.message });
    if (error.message === 'All tasks must have a title.') return res.status(400).json({ message: error.message });
    res.status(500).json({ message: 'Server Error', error: error.message });
    logError(req.user.id, error, req.originalUrl);
  }
};

// @desc    Delete a task
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    if (req.user.role === 'employee') return res.status(403).json({ message: 'Employees cannot delete tasks.' });
    if (req.user.role === 'manager' && !req.user.permissions.canDeleteTasks) {
      return res.status(403).json({ message: 'Restricted: You do not have permission to delete tasks.' });
    }

    logActivity(task.team, req.user.id, 'TASK_DELETED', `Deleted task '${task.title}'`);
    await task.deleteOne();
    res.json({ message: 'Task removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
    logError(req.user.id, error, req.originalUrl);
  }
};

exports.generateSubtasks = async (req, res) => {
  const { taskTitle } = req.body;
  if (!taskTitle) return res.status(400).json({ message: 'Please provide a task title' });
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

exports.getTaskEstimate = async (req, res) => {
  const { title, teamId } = req.body;
  const timezone = req.body.timezone || 'UTC';
  if (!title || !teamId) return res.status(400).json({ message: 'Task title and teamId are required' });
  try {
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    const isAuthorized = await hasTeamAccess(team, req.user);
    if (!isAuthorized) return res.status(401).json({ message: 'Not authorized for this team' });
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
