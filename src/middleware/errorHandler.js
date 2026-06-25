const ApiError = require("../utils/ApiError");

const errorHandler = (err, req, res, next) => {
  // Mongoose duplicate key (e.g. duplicate email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      message: `An account with this ${field} already exists.`,
    });
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(". "),
    });
  }

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid value for field: ${err.path}`,
    });
  }

  // Our own thrown ApiErrors
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  // Unexpected crashes
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong. Please try again.",
  });
};

module.exports = errorHandler;
