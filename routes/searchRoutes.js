const express = require('express');
const router = express.Router();
const { globalSearch } = require('../controllers/searchController');
const { protect } = require('../middleware/authMiddleware');

// @route   GET /api/search
router.route('/').get(protect, globalSearch);

module.exports = router;
