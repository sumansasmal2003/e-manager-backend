const express = require('express');
const router = express.Router();
const { getAnnouncements, createAnnouncement, deleteAnnouncement } = require('../controllers/announcementController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/', getAnnouncements);
router.post('/', authorize('owner'), createAnnouncement);
router.delete('/:id', authorize('owner'), deleteAnnouncement);

module.exports = router;
