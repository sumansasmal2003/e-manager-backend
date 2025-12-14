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

// --- EMAIL TEMPLATE BUILDER (Professional Layout) ---
const wrapEmailHTML = (heading, content, callToAction = null) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
        .container { width: 100%; max-width: 600px; margin: 0 auto; padding: 40px 20px; }
        .card { background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden; border: 1px solid #e2e8f0; }
        .header { background-color: #18181b; padding: 24px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
        .content { padding: 40px 32px; color: #334155; line-height: 1.6; font-size: 16px; }
        .heading { color: #0f172a; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 16px; }
        .cta-button { display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 24px; }
        .footer { padding: 24px; text-align: center; color: #94a3b8; font-size: 12px; }
        .info-row { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
        .info-label { font-weight: 600; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
        .info-value { color: #0f172a; font-size: 16px; display: block; margin-top: 4px; }
        .highlight { background-color: #f1f5f9; padding: 16px; border-radius: 8px; font-family: monospace; color: #0f172a; font-size: 24px; text-align: center; letter-spacing: 4px; margin: 24px 0; }

        /* Status Badges */
        .status-badge { display: inline-block; padding: 8px 12px; border-radius: 6px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
        .suspended { background-color: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .active { background-color: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="header">
            <h1>E-MANAGER</h1>
          </div>
          <div class="content">
            <h2 class="heading">${heading}</h2>
            ${content}
            ${callToAction ? `<div style="text-align: center;">${callToAction}</div>` : ''}
          </div>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} E-Manager Inc. All rights reserved.</p>
          <p>Secure. Reliable. Trusted.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const sendEmail = async (options, userId, memberName) => {
  const transporter = createTransporter();

  // --- FIX: Use dynamic sender or fallback to default ---
  const sender = options.from || `"E-Manager" <${process.env.EMAIL_USERNAME}>`;

  const mailOptions = {
    from: sender,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments || [],
    replyTo: options.replyTo
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);

    try {
      await EmailLog.create({
        user: userId || null,
        toEmail: options.to,
        memberName: memberName || 'System/Public',
        subject: options.subject,
        html: options.html,
        status: 'Sent'
      });
    } catch (logError) {
      console.error('Warning: Failed to save email log to DB:', logError.message);
    }
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    try {
      await EmailLog.create({
        user: userId || null,
        toEmail: options.to,
        subject: options.subject,
        html: options.html,
        status: 'Failed',
        error: error.message,
      });
    } catch (logError) {
      console.error('Failed to even log the email error:', logError.message);
    }
    throw new Error('Failed to send email.');
  }
};

/**
 * 1. Password Reset Email (Sender: Security)
 */
const sendPasswordResetEmail = async (email, otp, userId) => {
  const subject = 'Reset Your Password';

  const htmlContent = `
    <p>You requested a password reset for your E-Manager account. Please use the verification code below to proceed.</p>
    <div class="highlight">${otp}</div>
    <p style="font-size: 14px; color: #64748b;">This code will expire in <strong>10 minutes</strong>. If you did not request this, please ignore this email or contact support.</p>
  `;

  const html = wrapEmailHTML('Password Reset Request', htmlContent);
  const text = `Your E-Manager password reset code is: ${otp}. Expires in 10 minutes.`;

  await sendEmail({
    from: `"E-Manager Security" <${process.env.EMAIL_USERNAME}>`, // <--- CUSTOM SENDER
    to: email,
    subject,
    text,
    html
  }, userId, null);
};

/**
 * 2. Member Report Email (Sender: Reports)
 */
const sendMemberReportEmail = async (toEmail, memberName, pdfBuffer, userId) => {
  const subject = `Performance Report: ${memberName}`;

  const htmlContent = `
    <p>Hello ${memberName},</p>
    <p>Attached is your personalized performance report from E-Manager.</p>
    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
      <p style="margin: 0; color: #475569; font-size: 14px;">Please review the attached PDF for full details.</p>
    </div>
    <p>Keep up the great work!</p>
  `;

  const html = wrapEmailHTML('Performance Update', htmlContent);
  const text = `Hello ${memberName},\n\nHere is your personalized performance report from E-Manager. Please review the attached PDF for full details.\n\nE-Manager Team`;

  const attachments = [
    {
      filename: `E-Manager_Report_${memberName.replace(/\s+/g, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    },
  ];

  await sendEmail({
    from: `"E-Manager Reports" <${process.env.EMAIL_USERNAME}>`, // <--- CUSTOM SENDER
    to: toEmail,
    subject,
    text,
    html,
    attachments
  }, userId, memberName);
};

const sendWelcomeEmail = async (email, username, password, companyName, teamName, role, ownerId) => {
  const subject = `Welcome to ${companyName} - Your New Account`;
  const loginUrl = process.env.FRONTEND_URL || "https://your-app-url.com/login";

  const htmlContent = `
    <p>Hello <strong>${username}</strong>,</p>
    <p>Welcome to <strong>${companyName}</strong>! You have been added to the team <strong>${teamName}</strong> as an ${role}.</p>
    <p>Here are your temporary login credentials to get started:</p>

    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
      <div class="info-row" style="border-bottom: 1px solid #e2e8f0; margin-bottom: 12px; padding-bottom: 12px;">
        <span class="info-label" style="display:block; font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">Email</span>
        <span class="info-value" style="display:block; font-size:16px; color:#0f172a; margin-top:4px;">${email}</span>
      </div>
      <div class="info-row" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">
        <span class="info-label" style="display:block; font-size:12px; color:#64748b; font-weight:600; text-transform:uppercase;">Temporary Password</span>
        <span class="info-value" style="display:block; font-size:16px; color:#0f172a; margin-top:4px; font-family:monospace; letter-spacing: 1px;">${password}</span>
      </div>
    </div>

    <p style="font-size: 14px; color: #64748b;">For security purposes, please change your password immediately after your first login.</p>
  `;

  const cta = `<a href="${loginUrl}" class="cta-button" style="color: #ffffff;">Log in to Dashboard</a>`;
  const html = wrapEmailHTML('Welcome to the Team', htmlContent, cta);
  const text = `Welcome to ${companyName}!\n\nEmail: ${email}\nPassword: ${password}\n\nPlease log in here: ${loginUrl}`;

  await sendEmail({
    from: `"E-Manager Onboarding" <${process.env.EMAIL_USERNAME}>`,
    to: email,
    subject,
    text,
    html
  }, ownerId, username);
};

/**
 * 4. NEW: Account Status Email (Suspension/Activation)
 */
const sendAccountStatusEmail = async (email, username, companyName, isSuspended) => {
  const subject = isSuspended ? 'Action Required: Account Suspended' : 'Access Restored: Account Activated';
  const loginUrl = process.env.FRONTEND_URL || "https://your-app-url.com/login";

  const statusBadge = isSuspended
    ? '<div class="status-badge suspended">Account Suspended</div>'
    : '<div class="status-badge active">Account Active</div>';

  const messageBody = isSuspended
    ? `<p>Your access to the <strong>${companyName}</strong> workspace has been suspended by the organization administrator.</p>
       <p>You will no longer be able to log in or access your dashboard. If you believe this is an error, please contact your manager immediately.</p>`
    : `<p>Good news! Your access to the <strong>${companyName}</strong> workspace has been restored.</p>
       <p>You can now log in and resume your activities.</p>`;

  const htmlContent = `
    <div style="text-align: center;">${statusBadge}</div>
    <p>Hello <strong>${username}</strong>,</p>
    ${messageBody}
  `;

  const heading = isSuspended ? 'Account Status Update' : 'Welcome Back';
  const cta = isSuspended ? null : `<a href="${loginUrl}" class="cta-button" style="color: #ffffff;">Log In Now</a>`;

  const html = wrapEmailHTML(heading, htmlContent, cta);
  const text = isSuspended
    ? `Hello ${username}, your account for ${companyName} has been suspended. Please contact your admin.`
    : `Hello ${username}, your account for ${companyName} has been reactivated. Login here: ${loginUrl}`;

  await sendEmail({
    from: `"E-Manager Security" <${process.env.EMAIL_USERNAME}>`,
    to: email,
    subject,
    text,
    html
  }, null, username);
};

/**
 * 3. Job Application Emails (Sender: Careers)
 */
const sendJobApplicationEmails = async (applicantData, file) => {
  const adminEmail = 'sasmalsuman04@gmail.com';
  const { name, email, role, phone, coverLetter } = applicantData;

  // --- A. Email to Admin ---
  const adminContent = `
    <p>A new candidate has applied for the <strong>${role}</strong> position.</p>
    <div style="margin-top: 24px;">
      <div class="info-row"><span class="info-label">Candidate Name</span><span class="info-value">${name}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${email}</span></div>
      <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${phone || 'N/A'}</span></div>
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label">Message</span>
        <div style="margin-top: 8px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
          ${coverLetter ? coverLetter.replace(/\n/g, '<br>') : 'No message provided.'}
        </div>
      </div>
    </div>
  `;

  const adminHtml = wrapEmailHTML(`New Application: ${role}`, adminContent);

  await sendEmail({
    from: `"E-Manager Careers" <${process.env.EMAIL_USERNAME}>`, // <--- CUSTOM SENDER
    to: adminEmail,
    subject: `[New Candidate] ${role} - ${name}`,
    html: adminHtml,
    replyTo: email,
    attachments: file ? [{ filename: file.originalname, content: file.buffer }] : []
  }, null, name);

  // --- B. Confirmation Email to Applicant ---
  const applicantContent = `
    <p>Hi <strong>${name}</strong>,</p>
    <p>Thank you for applying to the <strong>${role}</strong> position at E-Manager.</p>
    <p>We have successfully received your application and resume. Our hiring team is currently reviewing applications, and we will reach out to you directly if your qualifications match our needs.</p>
  `;

  const applicantHtml = wrapEmailHTML('Application Received', applicantContent);

  await sendEmail({
    from: `"E-Manager Careers" <${process.env.EMAIL_USERNAME}>`, // <--- CUSTOM SENDER
    to: email,
    subject: `Application Received: ${role}`,
    html: applicantHtml
  }, null, name);
};

/**
 * 4. Contact Form Emails (Sender: Support)
 */
const sendContactEmails = async ({ name, email, reason, message }) => {
  const adminEmail = 'sasmalsuman04@gmail.com';

  // --- A. Email to Admin ---
  const adminContent = `
    <p>You have received a new contact inquiry from the public website.</p>
    <div style="margin-top: 24px;">
      <div class="info-row"><span class="info-label">Sender</span><span class="info-value">${name}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-value">${email}</span></div>
      <div class="info-row"><span class="info-label">Topic</span><span class="info-value">${reason}</span></div>
      <div class="info-row" style="border-bottom: none;">
        <span class="info-label">Message</span>
        <div style="margin-top: 8px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0;">${message.replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  `;

  const adminHtml = wrapEmailHTML(`New Inquiry: ${reason}`, adminContent);

  await sendEmail({
    from: `"E-Manager Support" <${process.env.EMAIL_USERNAME}>`, // <--- CUSTOM SENDER
    to: adminEmail,
    subject: `[Contact] ${reason} - ${name}`,
    html: adminHtml,
    replyTo: email
  }, null, name);

  // --- B. Confirmation Email to User ---
  const userContent = `
    <p>Hi ${name},</p>
    <p>Thank you for reaching out to E-Manager. We have received your message regarding <strong>${reason}</strong>.</p>
    <p>Our team is reviewing your inquiry and will get back to you within 24-48 hours.</p>
  `;

  const userHtml = wrapEmailHTML('We received your message', userContent);

  await sendEmail({
    from: `"E-Manager Support" <${process.env.EMAIL_USERNAME}>`, // <--- CUSTOM SENDER
    to: email,
    subject: `We received your message - E-Manager`,
    html: userHtml
  }, null, name);
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  sendMemberReportEmail,
  sendJobApplicationEmails,
  sendContactEmails,
  sendWelcomeEmail,
  sendAccountStatusEmail
};
