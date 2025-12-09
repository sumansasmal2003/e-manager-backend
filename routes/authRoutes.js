const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  createManager, // <-- Import this
  verifyTwoFactorLogin
} = require('../controllers/authController');
const { checkManagerLimit } = require('../middleware/subscriptionMiddleware');
const { loginLimiter } = require('../middleware/rateLimitMiddleware');

const { protect, authorize } = require('../middleware/authMiddleware'); // <-- Import middleware

// Public Routes
router.post('/register', registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected Routes (Owner Only)
router.post(
  '/create-manager',
  protect,
  authorize('owner'),
  checkManagerLimit, // <-- Add check here
  createManager
);

router.post('/verify-2fa', verifyTwoFactorLogin);

module.exports = router;
