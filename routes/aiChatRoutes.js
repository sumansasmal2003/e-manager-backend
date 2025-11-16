// routes/aiChatRoutes.js
const express = require('express');
const router = express.Router();
const { askAiChatbot } = require('../controllers/aiChatController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/chat/ask
// @desc    Ask a question to the user-context-aware AI
// @access  Private
router.route('/ask').post(protect, askAiChatbot);

module.exports = router;
