const User = require('../models/User');

// @desc    Get logged-in user's profile
// @route   GET /api/user/profile
exports.getUserProfile = async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user) {
    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      connecteamAdminLink: user.connecteamAdminLink, // <-- UPDATED
      googleCalendarConnected: user.googleCalendarConnected,
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Add a ConnecTeam account
// @route   POST /api/user/connecteam
exports.addConnecteamAccount = async (req, res) => {
  const { name, link } = req.body;
  if (!name || !link) {
    return res.status(400).json({ message: 'Please provide a name and a link' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.connecteamAccounts.push({ name, link });
    await user.save();

    // Send back just the new array
    res.status(201).json(user.connecteamAccounts);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Delete a ConnecTeam account
// @route   DELETE /api/user/connecteam/:id
exports.deleteConnecteamAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const accountId = req.params.id;

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const accountToDelete = user.connecteamAccounts.id(accountId);
    if (!accountToDelete) {
      return res.status(404).json({ message: 'Account not found' });
    }

    accountToDelete.deleteOne();
    await user.save();

    // Send back the updated array
    res.json(user.connecteamAccounts);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// --- ADD THIS NEW FUNCTION ---
// @desc    Update user profile (username & email)
// @route   PUT /api/user/profile
exports.updateUserProfile = async (req, res) => {
  const { username, email } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if email is already taken
    if (email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email is already in use' });
      }
    }

    // Check if username is already taken
    if (username !== user.username) {
        const usernameExists = await User.findOne({ username });
        if (usernameExists) {
             return res.status(400).json({ message: 'Username is already taken' });
        }
    }

    user.username = username || user.username;
    user.email = email || user.email;

    const updatedUser = await user.save();

    // Send back new user data (to update context)
    res.json({
      _id: updatedUser._id,
      username: updatedUser.username,
      email: updatedUser.email,
      connecteamAdminLink: updatedUser.connecteamAdminLink,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// --- ADD THIS NEW FUNCTION ---
// @desc    Change user password
// @route   PUT /api/user/change-password
exports.changeUserPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Please provide all fields' });
  }

  try {
    // We must select '+password' as it's hidden by default
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if current password matches
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid current password' });
    }

    // Set new password (pre-save hook in User model will hash it)
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
