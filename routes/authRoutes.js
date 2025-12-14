const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  createManager,
  createEmployee,
  verifyTwoFactorLogin
} = require('../controllers/authController');
const { checkManagerLimit, checkMemberLimit } = require('../middleware/subscriptionMiddleware'); // <-- Import checkMemberLimit
const { loginLimiter } = require('../middleware/rateLimitMiddleware');

const { protect, authorize } = require('../middleware/authMiddleware');

// Public Routes
router.post('/register', registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected Routes
router.post(
  '/create-manager',
  protect,
  authorize('owner'),
  checkManagerLimit,
  createManager
);

// New Employee Route with Limit Check
router.post(
  '/create-employee',
  protect,
  authorize('owner', 'manager'),
  checkMemberLimit, // <-- Added Limit Check here
  createEmployee
);

router.post('/verify-2fa', verifyTwoFactorLogin);

module.exports = router;
