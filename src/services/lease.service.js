const Lease = require("../models/Lease");

/**
 * Auto-generate a lease number: LS-2026-0001
 * Pads to 4 digits, increments per year.
 */
const generateLeaseNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `LS-${year}-`;

  // Find the latest lease for this year
  const latest = await Lease.findOne(
    { leaseNumber: new RegExp(`^${prefix}`) },
    { leaseNumber: 1 },
    { sort: { leaseNumber: -1 } },
  );

  let nextNumber = 1;
  if (latest) {
    const parts = latest.leaseNumber.split("-");
    nextNumber = parseInt(parts[2], 10) + 1;
  }

  return `${prefix}${String(nextNumber).padStart(4, "0")}`;
};

/**
 * Check if a unit has an active or pending lease.
 * Returns the conflicting lease or null.
 */
const getActiveLeaseForUnit = async (unitId) => {
  return Lease.findOne({
    unit: unitId,
    status: { $in: ["Active", "Pending"] },
  });
};

/**
 * Check for overlapping lease dates on a unit.
 * Used to block: Unit was rented Jan–Dec 2025, can't create another lease for March 2025.
 */
const hasOverlappingLease = async (
  unitId,
  startDate,
  endDate,
  excludeLeaseId = null,
) => {
  const query = {
    unit: unitId,
    status: { $nin: ["Cancelled", "Terminated"] },
    $or: [
      // New lease starts inside an existing lease
      { startDate: { $lte: startDate }, endDate: { $gte: startDate } },
      // New lease ends inside an existing lease
      { startDate: { $lte: endDate }, endDate: { $gte: endDate } },
      // New lease completely wraps an existing lease
      { startDate: { $gte: startDate }, endDate: { $lte: endDate } },
    ],
  };

  if (excludeLeaseId) {
    query._id = { $ne: excludeLeaseId };
  }

  const clash = await Lease.findOne(query);
  return !!clash;
};

module.exports = {
  generateLeaseNumber,
  getActiveLeaseForUnit,
  hasOverlappingLease,
};
