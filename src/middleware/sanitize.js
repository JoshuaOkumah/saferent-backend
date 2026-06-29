/**
 * Trims all string values in req.body recursively.
 * Prevents leading/trailing whitespace from slipping into the DB.
 * Applied globally in app.js.
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = trimStrings(req.body);
  }
  next();
};

const trimStrings = (obj) => {
  if (typeof obj === "string") return obj.trim();
  if (Array.isArray(obj)) return obj.map(trimStrings);
  if (obj !== null && typeof obj === "object") {
    const trimmed = {};
    for (const key of Object.keys(obj)) {
      trimmed[key] = trimStrings(obj[key]);
    }
    return trimmed;
  }
  return obj;
};

module.exports = sanitizeBody;
