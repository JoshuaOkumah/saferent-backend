const crypto = require("crypto");
const bcrypt = require("bcryptjs");

/**
 * Generate a cryptographically secure random token.
 * Returns both the plain token (to send in email) and the hash (to store in DB).
 */
const generateSecureToken = async () => {
  const plain = crypto.randomBytes(32).toString("hex"); // 64-char hex string
  const hash = await bcrypt.hash(plain, 10);
  return { plain, hash };
};

/**
 * Verify a plain token against a stored hash
 */
const verifySecureToken = async (plain, hash) => {
  return bcrypt.compare(plain, hash);
};

module.exports = { generateSecureToken, verifySecureToken };
