const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Not authenticated. Please log in.");
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      throw new ApiError(401, "Session expired. Please log in again.");
    }
    throw new ApiError(401, "Invalid token. Please log in.");
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    throw new ApiError(401, "User belonging to this token no longer exists.");
  }

  req.user = { id: user._id, role: user.role };
  next();
};

module.exports = protect;
