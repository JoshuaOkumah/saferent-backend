const ApiError = require("../utils/ApiError");

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Access denied. This route is restricted to: ${roles.join(", ")}.`,
      );
    }
    next();
  };
};

module.exports = restrictTo;
