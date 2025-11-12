// controllers/oneOnOneController.js

const OneOnOne = require('../models/OneOnOne');

// @desc    Get all 1-on-1s for a specific member
// @route   GET /api/oneonones/member/:memberName
exports.getOneOnOnesForMember = async (req, res) => {
  try {
    const oneOnOnes = await OneOnOne.find({
      leader: req.user.id,
      memberName: req.params.memberName,
    }).sort({ meetingDate: -1 }); // Show newest first

    res.json(oneOnOnes);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Create a new 1-on-1
// @route   POST /api/oneonones
exports.createOneOnOne = async (req, res) => {
  try {
    const { memberName, meetingDate, discussionPoints } = req.body;

    if (!memberName || !meetingDate) {
      return res.status(400).json({ message: 'Member name and meeting date are required' });
    }

    const oneOnOne = new OneOnOne({
      leader: req.user.id,
      memberName,
      meetingDate,
      discussionPoints: discussionPoints || '',
    });

    const createdOneOnOne = await oneOnOne.save();
    res.status(201).json(createdOneOnOne);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Update a 1-on-1 (add notes, action items, etc.)
// @route   PUT /api/oneonones/:id
exports.updateOneOnOne = async (req, res) => {
  try {
    const { discussionPoints, leaderNotes, actionItems, meetingDate } = req.body;
    const oneOnOne = await OneOnOne.findById(req.params.id);

    if (!oneOnOne) {
      return res.status(404).json({ message: '1-on-1 not found' });
    }

    // Check if it belongs to the leader
    if (oneOnOne.leader.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Update fields
    oneOnOne.discussionPoints = discussionPoints ?? oneOnOne.discussionPoints;
    oneOnOne.leaderNotes = leaderNotes ?? oneOnOne.leaderNotes;
    oneOnOne.actionItems = actionItems ?? oneOnOne.actionItems;
    oneOnOne.meetingDate = meetingDate ?? oneOnOne.meetingDate;

    const updatedOneOnOne = await oneOnOne.save();
    res.json(updatedOneOnOne);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Delete a 1-on-1
// @route   DELETE /api/oneonones/:id
exports.deleteOneOnOne = async (req, res) => {
  try {
    const oneOnOne = await OneOnOne.findById(req.params.id);

    if (!oneOnOne) {
      return res.status(404).json({ message: '1-on-1 not found' });
    }
    if (oneOnOne.leader.toString() !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await oneOnOne.deleteOne();
    res.json({ message: '1-on-1 removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
