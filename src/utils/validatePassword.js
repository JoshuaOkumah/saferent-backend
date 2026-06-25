const ApiError = require("./ApiError");

/**
 * Validates password strength.
 * Throws ApiError if requirements are not met.
 * Requirements: 8+ chars, uppercase, lowercase, number
 */
const validatePassword = (password) => {
  if (!password || password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ApiError(
      400,
      "Password must contain at least one uppercase letter",
    );
  }
  if (!/[a-z]/.test(password)) {
    throw new ApiError(
      400,
      "Password must contain at least one lowercase letter",
    );
  }
  if (!/[0-9]/.test(password)) {
    throw new ApiError(400, "Password must contain at least one number");
  }
};

module.exports = validatePassword;
