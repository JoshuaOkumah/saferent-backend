const User = require("../models/User");
const { generateToken } = require("../utils/jwt");
const { generateOTP, hashOTP, verifyOTP } = require("../utils/otp");
const {
  sendEmail,
  verificationEmailHTML,
  passwordResetEmailHTML,
} = require("../utils/sendEmail");
const validatePassword = require("../utils/validatePassword");
const ApiError = require("../utils/ApiError");
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ─── Helper: clean user shape for responses ───────────────────────────────────
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  provider: user.provider,
  isVerified: user.isVerified,
  profilePhoto: user.profilePhoto,
  bankAccount: user.bankAccount,
  createdAt: user.createdAt,
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────
const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email, and password are required");
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, "Please enter a valid email address");
  }

  // Validate password strength
  validatePassword(password);

  const existing = await User.findOne({ email });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists");
  }

  // Generate and hash OTP
  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Create user as unverified
  const user = await User.create({
    name,
    email,
    password,
    role: "landlord",
    provider: "local",
    isVerified: false,
    emailVerificationOtpHash: otpHash,
    emailVerificationExpiry: expiry,
  });

  // Send OTP email
  await sendEmail({
    to: email,
    subject: "Verify your RentSafe account",
    html: verificationEmailHTML(otp),
  });

  res.status(201).json({
    success: true,
    message:
      "Account created. A verification code has been sent to your email.",
    email: user.email,
  });
};

// ─── POST /api/auth/verify-email ──────────────────────────────────────────────
const verifyEmail = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const user = await User.findOne({ email }).select(
    "+emailVerificationOtpHash +failedLoginAttempts",
  );

  if (!user) {
    throw new ApiError(404, "No account found with this email");
  }

  if (user.isVerified) {
    throw new ApiError(400, "This account is already verified");
  }

  if (!user.emailVerificationOtpHash || !user.emailVerificationExpiry) {
    throw new ApiError(
      400,
      "No verification code found. Please register again.",
    );
  }

  if (user.emailVerificationExpiry < Date.now()) {
    throw new ApiError(
      400,
      "Verification code has expired. Please request a new one.",
    );
  }

  const isMatch = await verifyOTP(otp, user.emailVerificationOtpHash);
  if (!isMatch) {
    throw new ApiError(400, "Invalid verification code");
  }

  // Mark verified and clear OTP fields
  user.isVerified = true;
  user.emailVerificationOtpHash = null;
  user.emailVerificationExpiry = null;
  await user.save();

  const token = generateToken({ id: user._id, role: user.role });

  res.status(200).json({
    success: true,
    message: "Email verified successfully. Welcome to RentSafe.",
    token,
    user: sanitizeUser(user),
  });
};

// ─── POST /api/auth/resend-verification ───────────────────────────────────────
const resendVerification = async (req, res) => {
  const { email } = req.body;

  if (!email) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email }).select(
    "+emailVerificationOtpHash",
  );

  if (!user) throw new ApiError(404, "No account found with this email");
  if (user.isVerified)
    throw new ApiError(400, "This account is already verified");

  const otp = generateOTP();
  const otpHash = await hashOTP(otp);

  user.emailVerificationOtpHash = otpHash;
  user.emailVerificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  await sendEmail({
    to: email,
    subject: "Your new RentSafe verification code",
    html: verificationEmailHTML(otp),
  });

  res.status(200).json({
    success: true,
    message: "A new verification code has been sent to your email.",
  });
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required");
  }

  const user = await User.findOne({ email }).select(
    "+password +failedLoginAttempts +lockUntil",
  );

  console.log("USER FOUND:", !!user);

  if (user) {
    console.log("EMAIL:", user.email);
    console.log("VERIFIED:", user.isVerified);

    console.log("PROVIDER:", user.provider);
  }

  if (!user || user.provider === "google") {
    throw new ApiError(401, "Invalid email or password");
  }

  // Check account lock
  if (user.isLocked()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new ApiError(
      423,
      `Account is temporarily locked. Try again in ${minutesLeft} minute(s).`,
    );
  }

  // Check email verified
  if (!user.isVerified) {
    throw new ApiError(403, "Please verify your email before logging in.");
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    // Increment failed attempts
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
      user.failedLoginAttempts = 0;
      await user.save();
      throw new ApiError(
        423,
        "Too many failed attempts. Account locked for 30 minutes.",
      );
    }
    await user.save();
    throw new ApiError(401, "Invalid email or password");
  }

  // Successful login — reset counters
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const token = generateToken({ id: user._id, role: user.role });

  res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: sanitizeUser(user),
  });
};

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  res.status(200).json({
    success: true,
    user: sanitizeUser(user),
  });
};

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) throw new ApiError(400, "Email is required");

  const user = await User.findOne({ email });

  // Always respond the same — don't expose whether email exists
  if (!user || user.provider === "google") {
    return res.status(200).json({
      success: true,
      message:
        "If an account with that email exists, a reset code has been sent.",
    });
  }

  const otp = generateOTP();
  const otpHash = await hashOTP(otp);

  user.passwordResetOtpHash = otpHash;
  user.passwordResetExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  await sendEmail({
    to: email,
    subject: "RentSafe Password Reset",
    html: passwordResetEmailHTML(otp),
  });

  res.status(200).json({
    success: true,
    message:
      "If an account with that email exists, a reset code has been sent.",
  });
};

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new ApiError(400, "Email, OTP, and new password are required");
  }

  validatePassword(newPassword);

  const user = await User.findOne({ email }).select("+passwordResetOtpHash");

  if (!user || !user.passwordResetOtpHash || !user.passwordResetExpiry) {
    throw new ApiError(400, "Invalid or expired reset code");
  }

  if (user.passwordResetExpiry < Date.now()) {
    throw new ApiError(
      400,
      "Reset code has expired. Please request a new one.",
    );
  }

  const isMatch = await verifyOTP(otp, user.passwordResetOtpHash);
  if (!isMatch) {
    throw new ApiError(400, "Invalid reset code");
  }

  // Update password and clear reset fields
  user.password = newPassword; // pre-save hook will hash it
  user.passwordResetOtpHash = null;
  user.passwordResetExpiry = null;
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password reset successful. You can now log in.",
  });
};

// ─── POST /api/auth/google ────────────────────────────────────────────────────
const googleAuth = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) throw new ApiError(400, "Google ID token is required");

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, "Invalid Google token");
  }

  const { email, name, picture } = payload;

  let user = await User.findOne({ email });

  if (user && user.provider === "local") {
    throw new ApiError(
      409,
      "An account with this email already exists. Please log in with your password.",
    );
  }

  if (!user) {
    user = await User.create({
      name,
      email,
      provider: "google",
      isVerified: true, // Google handles verification
      role: "landlord",
      profilePhoto: picture || null,
    });
  }

  const token = generateToken({ id: user._id, role: user.role });

  res.status(200).json({
    success: true,
    message: "Google sign-in successful",
    token,
    user: sanitizeUser(user),
  });
};

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  googleAuth,
};
