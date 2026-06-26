const ActivityLog = require("../models/ActivityLog");

/**
 * Log an action. Call this after any significant operation.
 * Does not throw — log failures should never crash the main flow.
 */
const logActivity = async ({ actor, action, entity, entityId, meta = {} }) => {
  try {
    await ActivityLog.create({ actor, action, entity, entityId, meta });
  } catch (err) {
    console.error("ActivityLog error:", err.message);
  }
};

module.exports = { logActivity };
