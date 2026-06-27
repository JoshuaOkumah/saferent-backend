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

const tenantInvitationEmailHTML = ({
  landlordName,
  propertyName,
  unitNumber,
  activationUrl,
  tenantFirstName,
}) => `
  <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
    <h2 style="color: #1a1a1a; margin-bottom: 8px;">Welcome to RentSafe</h2>
    <p style="color: #555; font-size: 15px;">Hi ${tenantFirstName},</p>
    <p style="color: #555; font-size: 15px;">
      <strong>${landlordName}</strong> has invited you to access your tenant portal on RentSafe.
    </p>
    <table style="width: 100%; background: #fff; border-radius: 6px; padding: 16px; margin: 24px 0; border: 1px solid #e5e5e5;">
      <tr>
        <td style="color: #999; font-size: 13px; padding: 6px 0;">Property</td>
        <td style="color: #1a1a1a; font-weight: bold; font-size: 14px;">${propertyName}</td>
      </tr>
      <tr>
        <td style="color: #999; font-size: 13px; padding: 6px 0;">Unit</td>
        <td style="color: #1a1a1a; font-weight: bold; font-size: 14px;">${unitNumber}</td>
      </tr>
    </table>
    <p style="color: #555; font-size: 14px;">Click the button below to activate your account. This link expires in <strong>24 hours</strong>.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${activationUrl}"
         style="background: #1a1a1a; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: bold;">
        Activate Account
      </a>
    </div>
    <p style="color: #999; font-size: 12px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
  </div>
`;

const tenantAccountActivatedEmailHTML = (firstName) => `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9f9f9; border-radius: 8px;">
    <h2 style="color: #1a1a1a;">Account Activated</h2>
    <p style="color: #555; font-size: 15px;">Hi ${firstName}, your RentSafe tenant account is now active.</p>
    <p style="color: #555; font-size: 14px;">You can now log in to view your lease, make payments, and submit maintenance requests.</p>
  </div>
`;

module.exports = {
  sendEmail,
  verificationEmailHTML,
  passwordResetEmailHTML,
  tenantInvitationEmailHTML,
  tenantAccountActivatedEmailHTML,
};
