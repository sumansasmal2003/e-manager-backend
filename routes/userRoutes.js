const express = require('express');
const router = express.Router();
const {
  getUserProfile,
  addConnecteamAccount,
  deleteConnecteamAccount, // <-- CHANGED
  updateUserProfile,    // <-- ADD THIS
  changeUserPassword,
  deleteUserAccount
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

// All these routes are protected
router.use(protect);

router.route('/profile').get(getUserProfile).put(updateUserProfile).delete(deleteUserAccount);
router.route('/connecteam')
  .post(addConnecteamAccount);

router.route('/connecteam/:id')
  .delete(deleteConnecteamAccount);
router.route('/change-password')
  .put(changeUserPassword);

// REMOVE the '/connections' routes

module.exports = router;
