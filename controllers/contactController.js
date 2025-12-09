const { sendContactEmails } = require('../services/emailService');
const { logError } = require('../services/logService');

// @desc    Submit public contact form
// @route   POST /api/contact
exports.submitContactForm = async (req, res) => {
  try {
    const { name, email, reason, message } = req.body;

    if (!name || !email || !reason || !message) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    await sendContactEmails({ name, email, reason, message });

    res.status(200).json({ message: 'Message sent successfully!' });

  } catch (error) {
    console.error('Contact Form Error:', error);
    // Log with a placeholder ID since user might be guest
    logError('PUBLIC_GUEST', error, req.originalUrl);
    res.status(500).json({ message: 'Failed to send message. Please try again later.' });
  }
};
