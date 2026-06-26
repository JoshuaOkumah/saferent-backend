const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

/**
 * Run after express-validator rule arrays.
 * Collects all errors and throws a single 400 with a clean message.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    throw new ApiError(400, messages[0]); // surface the first error
  }
  next();
};

module.exports = validate;
