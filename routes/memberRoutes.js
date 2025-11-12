const express = require('express');
const router = express.Router();
const {
  getAllMembers,
  getMemberDetails,
  updateMemberProfile
} = require('../controllers/memberController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

router.route('/')
  .get(getAllMembers); // GET /api/members

router.route('/details')
  .get(getMemberDetails); // GET /api/members/details?name=...

  router.route('/profile')
  .put(updateMemberProfile);

module.exports = router;
