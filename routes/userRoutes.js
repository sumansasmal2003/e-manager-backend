const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  addConnecteamAccount,
  deleteConnecteamAccount,
  updateUserProfile,
  changeUserPassword,
  deleteUserAccount,
  getMyManagers, // <-- Import
  deleteManager,  // <-- Import
  updateSubscription,
  updateManagerPermissions,
  toggleManagerStatus,
  recordAdWatch,
  generate2FASecret,
  enable2FA,
  disable2FA,
  updateBranding
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All these routes are protected
router.use(protect);

router.route('/profile')
  .get(getUserProfile)
  .put(updateUserProfile)
  .delete(deleteUserAccount);

router.route('/connecteam')
  .post(addConnecteamAccount);

router.route('/connecteam/:id')
  .delete(deleteConnecteamAccount);

router.route('/change-password')
  .put(changeUserPassword);

// --- NEW: Manager Management Routes (Owner Only) ---
router.route('/managers')
  .get(authorize('owner'), getMyManagers);

router.route('/managers/:id')
  .delete(authorize('owner'), deleteManager);

router.route('/subscription')
  .put(updateSubscription);

router.route('/managers/:id/permissions')
  .put(authorize('owner'), updateManagerPermissions);

router.route('/managers/:id/suspend')
  .put(authorize('owner'), toggleManagerStatus);

router.route('/subscription/watch-ad')
  .post(recordAdWatch);

router.route('/2fa/generate').post(generate2FASecret);
router.route('/2fa/enable').post(enable2FA);
router.route('/2fa/disable').post(disable2FA);

router.put('/branding', protect, updateBranding);

module.exports = router;
