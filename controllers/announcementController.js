const Announcement = require('../models/Announcement');
const { logActivity } = require('../services/activityService'); // Optional: Log this action
const { logError } = require('../services/logService');

// @desc    Get active announcements
// @route   GET /api/announcements
exports.getAnnouncements = async (req, res) => {
  try {
    const now = new Date();
    // Fetch announcements that haven't expired yet
    // Sort by priority (high first) then newest
    const announcements = await Announcement.find({
      expiresAt: { $gt: now }
    }).sort({ priority: -1, createdAt: -1 });

    res.json(announcements);
  } catch (error) {
    console.error('Get Announcements Error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Create an announcement (Owner Only)
// @route   POST /api/announcements
exports.createAnnouncement = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Only owners can post announcements.' });
    }

    const { message, priority, daysActive } = req.body;

    if (!message || !daysActive) {
      return res.status(400).json({ message: 'Message and duration are required.' });
    }

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(daysActive));

    const announcement = await Announcement.create({
      message,
      priority: priority || 'low',
      expiresAt,
      createdBy: req.user.id
    });

    res.status(201).json(announcement);

  } catch (error) {
    console.error('Create Announcement Error:', error);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Delete an announcement
// @route   DELETE /api/announcements/:id
exports.deleteAnnouncement = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    await announcement.deleteOne();
    res.json({ message: 'Announcement removed' });

  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};
