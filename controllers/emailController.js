// controllers/emailController.js
const { logAiAction } = require('../services/aiLogService');
const { logError } = require('../services/logService');
const { generateEmailDraft } = require('../services/reportService');
const { sendEmail } = require('../services/emailService');
const { gatherAllUserData } = require('./aiChatController'); // We can reuse this!
const MemberProfile = require('../models/MemberProfile');

// @desc    Draft an email using AI
// @route   POST /api/emails/draft
exports.draftEmailWithAI = async (req, res) => {
  const { userPrompt, memberNames } = req.body; // e.g., "Warn Suman", ["Suman"]
  const userId = req.user.id;
  const username = req.user.username;

  try {
    // 1. Gather context for the AI
    // We get ALL user data, the same as the chat agent.
    const { dataContext } = await gatherAllUserData(userId, username, req.body.timezone || 'UTC');

    // 2. Call the AI to generate the draft
    const draft = await generateEmailDraft(userPrompt, dataContext, username);

    // 3. Log this action
    logAiAction(userId, 'AI_DRAFT_EMAIL');

    // 4. Send the draft {subject, body} to the frontend
    res.json(draft);

  } catch (error) {
    console.error('Draft Email Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// @desc    Send a bulk, personalized email
// @route   POST /api/emails/send
exports.sendBulkEmail = async (req, res) => {
  const { subject, body, memberNames } = req.body; // array of names
  const userId = req.user.id;

  try {
    if (!subject || !body || !memberNames || memberNames.length === 0) {
      return res.status(400).json({ message: 'Subject, body, and recipients are required.' });
    }

    // 1. Find the email addresses for all members
    const profiles = await MemberProfile.find({
      leader: userId,
      name: { $in: memberNames }
    }).select('name email');

    const emailMap = new Map();
    profiles.forEach(p => {
      if(p.email) emailMap.set(p.name, p.email);
    });

    // 2. Loop and send an email to each
    let sentCount = 0;
    let failedCount = 0;
    const sendPromises = [];

    for (const name of memberNames) {
      const toEmail = emailMap.get(name);
      if (!toEmail) {
        console.warn(`No email found for member: ${name}. Skipping.`);
        failedCount++;
        continue;
      }

      // Personalize the email
      const personalizedBody = body
        .replace(/{MEMBER_NAME}/g, name)
        .replace(/{LEADER_NAME}/g, req.user.username);

      const personalizedSubject = subject
        .replace(/{MEMBER_NAME}/g, name);

      // Add to promise array (fire and forget)
      sendPromises.push(
        sendEmail({
          to: toEmail,
          subject: personalizedSubject,
          html: personalizedBody,
        }, userId, name)
      );
      sentCount++;
    }

    // We don't need to await all, we just start them
    Promise.all(sendPromises).catch(err => {
      // Log errors, but don't block the response
      console.error("Error sending bulk email (some failed):", err.message);
      logError(userId, new Error("Bulk send partial failure"), req.originalUrl, 'WARN');
    });

    res.json({ message: `Email successfully sent to ${sentCount} members. ${failedCount} failed (no email on file).` });

  } catch (error) {
    console.error('Send Bulk Email Error:', error.message);
    logError(req.user.id, error, req.originalUrl);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};
