// routes/oneOnOneRoutes.js

const express = require('express');
const router = express.Router();
const {
  getOneOnOnesForMember,
  createOneOnOne,
  updateOneOnOne,
  deleteOneOnOne,
} = require('../controllers/oneOnOneController');
const { protect } = require('../middleware/authMiddleware');

// Protect all routes in this file
router.use(protect);

router.route('/')
  .post(createOneOnOne); // POST /api/oneonones

router.route('/member/:memberName')
  .get(getOneOnOnesForMember); // GET /api/oneonones/member/JohnDoe

router.route('/:id')
  .put(updateOneOnOne)    // PUT /api/oneonones/some-id
  .delete(deleteOneOnOne); // DELETE /api/oneonones/some-id

module.exports = router;
