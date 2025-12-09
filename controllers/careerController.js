const { sendJobApplicationEmails } = require('../services/emailService');

exports.submitApplication = async (req, res) => {
  try {
    const { name, email, role, phone, coverLetter } = req.body;
    const file = req.file; // From multer

    if (!name || !email || !role || !file) {
      return res.status(400).json({ message: 'Please provide name, email, role, and a resume.' });
    }

    // Send emails
    await sendJobApplicationEmails({ name, email, role, phone, coverLetter }, file);

    res.status(200).json({ message: 'Application submitted successfully!' });

  } catch (error) {
    console.error('Application Error:', error);
    res.status(500).json({ message: 'Failed to submit application. Please try again later.' });
  }
};
