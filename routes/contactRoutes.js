const express = require('express');
const router = express.Router();
const { submitContactForm } = require('../controllers/contactController');
const { generalLimiter } = require('../middleware/rateLimitMiddleware');

// Apply rate limiting to prevent spam
router.post('/', generalLimiter, submitContactForm);

module.exports = router;
