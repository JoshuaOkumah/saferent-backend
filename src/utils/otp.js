const bcrypt = require("bcryptjs");
const crypto = require("crypto");

/**
 * Generate a 6-digit OTP as a string
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Hash an OTP before storing it — same approach as passwords
 */
const hashOTP = async (otp) => {
  return bcrypt.hash(otp, 10);
};

/**
 * Compare a plain OTP against a stored hash
 */
const verifyOTP = async (plain, hashed) => {
  return bcrypt.compare(plain, hashed);
};

module.exports = { generateOTP, hashOTP, verifyOTP };
