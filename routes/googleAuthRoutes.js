const express = require('express');
const router = express.Router();
const {
  googleLogin,
  googleLoginCallback,
  googleAuth,
  googleAuthCallback,
  googleDisconnect
} = require('../controllers/googleAuthController');
const { protect } = require('../middleware/authMiddleware');

// 1. LOGIN ROUTES (Public)
// Matches: /api/google-auth/google
router.get('/google', googleLogin);

// Matches: /api/google-auth/callback
router.get('/callback', googleLoginCallback);


// 2. CALENDAR ROUTES (Protected)
// Matches: /api/google-auth/connect
router.get('/connect', protect, googleAuth);

// Matches: /api/google-auth/calendar/callback
router.get('/calendar/callback', googleAuthCallback);

// Matches: /api/google-auth/disconnect
router.delete('/disconnect', protect, googleDisconnect);

module.exports = router;
