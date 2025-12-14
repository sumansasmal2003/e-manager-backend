const express = require('express');
const router = express.Router();
const {
  getAllMembers,
  getMemberDetails,
  updateMemberProfile,
  sendMemberReport,
  generateTalkingPoints,
  deleteMember,
  toggleEmployeeStatus
} = require('../controllers/memberController');
const { protect } = require('../middleware/authMiddleware');
const { checkMemberLimit } = require('../middleware/subscriptionMiddleware');

// Protect all routes
router.use(protect);

router.route('/')
  .get(getAllMembers); // GET /api/members

router.route('/details')
  .get(getMemberDetails); // GET /api/members/details?name=...

router.route('/profile')
  .put(checkMemberLimit, updateMemberProfile);

router.route('/send-report')
  .post(sendMemberReport);

router.route('/talking-points')
  .get(generateTalkingPoints);

router.route('/:name')
  .delete(deleteMember);

router.route('/:id/suspend')
  .put(toggleEmployeeStatus);

module.exports = router;
