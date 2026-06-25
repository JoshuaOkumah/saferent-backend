const rateLimit = require("express-rate-limit");

// Max 5 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Max 3 OTP requests per 10 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message:
      "Too many OTP requests. Please wait 10 minutes before trying again.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, otpLimiter };
