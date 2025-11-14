// routes/googleAuthRoutes.js
const express = require('express');
const router = express.Router();
const { googleAuth, googleAuthCallback, googleDisconnect } = require('../controllers/googleAuthController');
const { protect } = require('../middleware/authMiddleware');

// 1. Starts the auth process, redirects user to Google
router.get('/', protect, googleAuth);

// 2. Google redirects back here with a code
router.get('/callback', googleAuthCallback);
router.delete('/disconnect', protect, googleDisconnect);

module.exports = router;
