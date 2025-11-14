const nodemailer = require('nodemailer');
const EmailLog = require('../models/EmailLog');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

const sendEmail = async (options, userId, memberName) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: '"E-Manager Support" <support@e-manager.com>',
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments || [], // <-- Handle attachments
  };

  const logEntry = {
    user: userId,
    toEmail: options.to,
    memberName: memberName,
    subject: options.subject,
    html: options.html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
    await EmailLog.create({ ...logEntry, status: 'Sent' });
    return true; // Indicate success
  } catch (error) {
    console.error('Error sending email:', error);
    try {
      await EmailLog.create({
        ...logEntry,
        status: 'Failed',
        error: error.message,
      });
    } catch (logError) {
      console.error('Failed to even log the email error:', logError);
    }
    throw new Error('Failed to send email.'); // Throw error this time
  }
};

/**
 * Sends the password reset OTP email.
 *
 * @param {string} email - The user's email address
 * @param {string} otp - The 6-digit OTP
 */
exports.sendPasswordResetEmail = async (email, otp, userId) => {
  const subject = 'Your E-Manager Password Reset Code (Valid for 10 min)';

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>You requested a password reset for your E-Manager account. Please use the One-Time Password (OTP) below to set a new password.</p>
      <div style="text-align: center; margin: 25px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background-color: #f4f4f4; padding: 10px 20px; border-radius: 5px;">
          ${otp}
        </span>
      </div>
      <p>This code will expire in <strong>10 minutes</strong>.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;" />
      <p style="font-size: 0.9em; color: #888;">E-Manager Team</p>
    </div>
  `;

  const text = `Your E-Manager password reset code is: ${otp}. This code expires in 10 minutes.`;

  await sendEmail({
    to: email,
    subject,
    text,
    html,
  }, userId, null);
};

/**
 * Sends a member report email with a PDF attachment.
 *
 * @param {string} toEmail - The recipient's email address
 * @param {string} memberName - The member's name
 * @param {Buffer} pdfBuffer - The generated PDF data
 */
exports.sendMemberReportEmail = async (toEmail, memberName, pdfBuffer, userId) => {
  const subject = `Your E-Manager Performance Report - ${memberName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color: #333;">Hello ${memberName},</h2>
      <p>Here is your personalized performance report from E-Manager.</p>
      <p>This report contains a summary of your assigned tasks and recent attendance. Please review the attached PDF for full details.</p>
      <p>Keep up the great work!</p>
      <br />
      <p style="font-size: 0.9em; color: #888;">E-Manager Team</p>
    </div>
  `;

  const text = `Hello ${memberName},\n\nHere is your personalized performance report from E-Manager. Please review the attached PDF for full details.\n\nE-Manager Team`;

  const attachments = [
    {
      filename: `E-Manager_Report_${memberName.replace(' ', '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    },
  ];

  await sendEmail({
    to: toEmail,
    subject,
    text,
    html,
    attachments,
  }, userId, memberName);
};
