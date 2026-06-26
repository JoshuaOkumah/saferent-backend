const Unit = require("../models/Unit");

/**
 * Compute live unit stats for a property.
 * Called when building property detail or dashboard responses.
 */
const getPropertyStats = async (propertyId) => {
  const stats = await Unit.aggregate([
    { $match: { property: propertyId, isArchived: false } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    total: 0,
    occupied: 0,
    vacant: 0,
    reserved: 0,
    underMaintenance: 0,
  };

  for (const s of stats) {
    result.total += s.count;
    if (s._id === "Occupied") result.occupied = s.count;
    if (s._id === "Vacant") result.vacant = s.count;
    if (s._id === "Reserved") result.reserved = s.count;
    if (s._id === "Under Maintenance") result.underMaintenance = s.count;
  }

  result.occupancyRate =
    result.total > 0 ? Math.round((result.occupied / result.total) * 100) : 0;

  return result;
};

module.exports = { getPropertyStats };
