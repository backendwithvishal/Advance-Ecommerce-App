'use strict';

const nodemailer = require('nodemailer');

// Singleton transporter — created once per process lifetime.
// Avoids a new TCP + TLS handshake per email (was ~3-5s per send under load).
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS, // Gmail App Password
  },
});

/**
 * Send an email.
 * @param {object} opts
 * @param {string} opts.email   - Recipient address
 * @param {string} opts.subject - Subject line
 * @param {string} opts.message - HTML message body
 */
const sendEmail = async ({ email, subject, message }) => {
  const mailOptions = {
    from: `"ShopNest Support" <${process.env.GMAIL_USER}>`,
    to: email,
    subject,
    html: message,
  };

  await transporter.sendMail(mailOptions);
  console.log(`[Email] Sent to ${email}: ${subject}`);
};

module.exports = sendEmail;
