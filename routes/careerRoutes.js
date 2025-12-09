const express = require('express');
const router = express.Router();
const multer = require('multer');
const { submitApplication } = require('../controllers/careerController');

// Configure Multer to store file in memory (buffer)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'application/msword' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed.'));
    }
  }
});

// POST /api/careers/apply
router.post('/apply', upload.single('resume'), submitApplication);

module.exports = router;
