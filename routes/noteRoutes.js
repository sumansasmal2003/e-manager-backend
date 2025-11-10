const express = require('express');
const router = express.Router();
const {
  getMyNotes,
  createNote,
  updateNote,
  deleteNote,
} = require('../controllers/noteController');

// Import the middleware
const { protect } = require('../middleware/authMiddleware');

// Apply the 'protect' middleware to all these routes
// This ensures only logged-in users can access them
router.route('/').get(protect, getMyNotes).post(protect, createNote);

router
  .route('/:id')
  .put(protect, updateNote)
  .delete(protect, deleteNote);

module.exports = router;
