const express = require("express");
const router = express.Router();

const {
  register,
  verifyEmail,
  resendVerification,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  googleAuth,
} = require("../controllers/auth.controller");

const protect = require("../middleware/protect");
const { loginLimiter, otpLimiter } = require("../middleware/rateLimiter");

// Registration
router.post("/register", otpLimiter, register);
router.post("/verify-email", verifyEmail);
router.post("/resend-verification", otpLimiter, resendVerification);

// Login
router.post("/login", loginLimiter, login);

// Authenticated user
router.get("/me", protect, getMe);

// Password reset
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", resetPassword);

// Google OAuth
router.post("/google", googleAuth);

module.exports = router;
