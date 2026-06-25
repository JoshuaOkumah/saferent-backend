const transporter = require("../config/email");

const sendEmail = async ({ to, subject, html }) => {
  console.log("Sending OTP to:", to);
  const mailOptions = {
    from: `"RentSafe" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  const info = await transporter.sendMail(mailOptions);

  console.log("MAIL INFO:");
  console.log(info);
};

// ─── Email Templates ──────────────────────────────────────────────────────────

const verificationEmailHTML = (otp) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
    <h2 style="color: #1a1a1a; margin-bottom: 8px;">RentSafe Email Verification</h2>
    <p style="color: #555; font-size: 15px;">Use the code below to verify your email address. It expires in <strong>10 minutes</strong>.</p>
    <div style="margin: 32px 0; text-align: center;">
      <span style="font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${otp}</span>
    </div>
    <p style="color: #999; font-size: 13px;">If you didn't create a RentSafe account, you can safely ignore this email.</p>
  </div>
`;

const passwordResetEmailHTML = (otp) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
    <h2 style="color: #1a1a1a; margin-bottom: 8px;">RentSafe Password Reset</h2>
    <p style="color: #555; font-size: 15px;">Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
    <div style="margin: 32px 0; text-align: center;">
      <span style="font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${otp}</span>
    </div>
    <p style="color: #999; font-size: 13px;">If you didn't request a password reset, you can safely ignore this email.</p>
  </div>
`;

module.exports = { sendEmail, verificationEmailHTML, passwordResetEmailHTML };
