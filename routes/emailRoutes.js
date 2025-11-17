// routes/emailRoutes.js
const express = require('express');
const router = express.Router();
const {
  draftEmailWithAI,
  sendBulkEmail
} = require('../controllers/emailController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

// @route   POST /api/emails/draft
// @desc    Draft a new email using AI
router.route('/draft').post(draftEmailWithAI);

// @route   POST /api/emails/send
// @desc    Send a bulk email to specified members
router.route('/send').post(sendBulkEmail);

module.exports = router;
