const express = require('express');
const router = express.Router();
const { getOverviewStats } = require('../controllers/statsController');
const { protect } = require('../middleware/authMiddleware');

// All routes here are protected
router.use(protect);

router.route('/overview').get(getOverviewStats);

module.exports = router;
