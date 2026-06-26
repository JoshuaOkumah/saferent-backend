const Lease = require("../models/Lease");
const Tenant = require("../models/Tenant");
const Unit = require("../models/Unit");
const Property = require("../models/Property");
const ApiError = require("../utils/ApiError");
const { logActivity } = require("../services/activityLog.service");
const {
  generateLeaseNumber,
  getActiveLeaseForUnit,
  hasOverlappingLease,
} = require("../services/lease.service");

// ─── POST /api/leases ─────────────────────────────────────────────────────────
const createLease = async (req, res) => {
  const {
    tenantId,
    propertyId,
    unitId,
    startDate,
    endDate,
    rentAmount,
    securityDeposit,
    serviceCharge,
    paymentFrequency,
    rentDueDay,
    gracePeriod,
    noticePeriod,
    renewalOption,
    notes,
  } = req.body;

  // ── 1. Verify tenant belongs to this landlord ──────────────────────────────
  const tenant = await Tenant.findOne({ _id: tenantId, owner: req.user.id });
  if (!tenant) throw new ApiError(404, "Tenant not found");
  if (tenant.status === "Archived")
    throw new ApiError(400, "Cannot create a lease for an archived tenant");
  if (tenant.status === "Blacklisted")
    throw new ApiError(400, "Cannot create a lease for a blacklisted tenant");

  // ── 2. Verify property belongs to this landlord ───────────────────────────
  const property = await Property.findOne({
    _id: propertyId,
    owner: req.user.id,
  });
  if (!property) throw new ApiError(404, "Property not found");
  if (property.status === "Archived")
    throw new ApiError(400, "Cannot create a lease on an archived property");

  // ── 3. Verify unit belongs to this property ───────────────────────────────
  const unit = await Unit.findOne({
    _id: unitId,
    property: propertyId,
    owner: req.user.id,
  });
  if (!unit) throw new ApiError(404, "Unit not found in this property");
  if (unit.isArchived)
    throw new ApiError(400, "Cannot create a lease on an archived unit");

  // ── 4. Unit must be vacant or reserved ───────────────────────────────────
  if (unit.status === "Occupied") {
    throw new ApiError(
      400,
      "This unit is already occupied. Terminate the existing lease first.",
    );
  }
  if (unit.status === "Under Maintenance") {
    throw new ApiError(
      400,
      "This unit is under maintenance and cannot be leased.",
    );
  }

  // ── 5. No active lease on this unit ──────────────────────────────────────
  const existingActiveLease = await getActiveLeaseForUnit(unitId);
  if (existingActiveLease) {
    throw new ApiError(400, "An active lease already exists for this unit.");
  }

  // ── 6. Tenant cannot have two simultaneous active leases ──────────────────
  const tenantActiveLease = await Lease.findOne({
    tenant: tenantId,
    status: "Active",
  });
  if (tenantActiveLease) {
    throw new ApiError(
      400,
      "This tenant already has an active lease. A tenant can only occupy one unit at a time.",
    );
  }

  // ── 7. Check for overlapping lease dates on this unit ────────────────────
  const overlap = await hasOverlappingLease(
    unitId,
    new Date(startDate),
    new Date(endDate),
  );
  if (overlap) {
    throw new ApiError(
      400,
      "Lease dates overlap with an existing lease for this unit.",
    );
  }

  // ── 8. Generate lease number ──────────────────────────────────────────────
  const leaseNumber = await generateLeaseNumber();

  // ── 9. Create lease ───────────────────────────────────────────────────────
  const lease = await Lease.create({
    leaseNumber,
    tenant: tenantId,
    property: propertyId,
    unit: unitId,
    landlord: req.user.id,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    rentAmount,
    securityDeposit: securityDeposit || 0,
    serviceCharge: serviceCharge || 0,
    paymentFrequency: paymentFrequency || "Monthly",
    rentDueDay: rentDueDay || 1,
    gracePeriod: gracePeriod ?? 7,
    noticePeriod: noticePeriod ?? 30,
    renewalOption: renewalOption ?? true,
    notes: notes || null,
    status: "Active",
  });

  // ── 10. Update unit: mark occupied, assign tenant ─────────────────────────
  unit.status = "Occupied";
  unit.tenant = tenant._id;
  await unit.save();

  // ── 11. Update tenant: mark active ───────────────────────────────────────
  tenant.status = "Active";
  await tenant.save();

  await logActivity({
    actor: req.user.id,
    action: "LEASE_CREATED",
    entity: "Lease",
    entityId: lease._id,
    meta: {
      leaseNumber,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      unitNumber: unit.unitNumber,
    },
  });

  const populated = await Lease.findById(lease._id)
    .populate("tenant", "firstName lastName email phone")
    .populate("property", "name address")
    .populate("unit", "unitNumber unitType");

  res.status(201).json({
    success: true,
    message: "Lease created successfully",
    data: populated,
  });
};

// ─── GET /api/leases ──────────────────────────────────────────────────────────
const getLeases = async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    propertyId,
    unitId,
    tenantId,
  } = req.query;

  const filter = { landlord: req.user.id };
  if (status) filter.status = status;
  if (propertyId) filter.property = propertyId;
  if (unitId) filter.unit = unitId;
  if (tenantId) filter.tenant = tenantId;

  const skip = (Number(page) - 1) * Number(limit);

  const [leases, total] = await Promise.all([
    Lease.find(filter)
      .populate("tenant", "firstName lastName email phone")
      .populate("property", "name address")
      .populate("unit", "unitNumber unitType")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Lease.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: leases,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  });
};

// ─── GET /api/leases/:id ──────────────────────────────────────────────────────
const getLeaseById = async (req, res) => {
  const lease = await Lease.findOne({
    _id: req.params.id,
    landlord: req.user.id,
  })
    .populate("tenant", "firstName lastName email phone profilePhoto")
    .populate("property", "name address city state")
    .populate("unit", "unitNumber unitType rentAmount")
    .populate("renewedFrom", "leaseNumber startDate endDate status")
    .populate("renewedTo", "leaseNumber startDate endDate status");

  if (!lease) throw new ApiError(404, "Lease not found");

  res.status(200).json({ success: true, data: lease });
};

// ─── PATCH /api/leases/:id/terminate ─────────────────────────────────────────
const terminateLease = async (req, res) => {
  const { reason } = req.body;

  const lease = await Lease.findOne({
    _id: req.params.id,
    landlord: req.user.id,
  });
  if (!lease) throw new ApiError(404, "Lease not found");

  const terminableStatuses = ["Active", "Pending"];
  if (!terminableStatuses.includes(lease.status)) {
    throw new ApiError(
      400,
      `Cannot terminate a lease with status: ${lease.status}`,
    );
  }

  // Update lease
  lease.status = "Terminated";
  lease.terminatedAt = new Date();
  lease.terminationReason = reason || null;
  await lease.save();

  // Free the unit
  const unit = await Unit.findById(lease.unit);
  if (unit) {
    unit.status = "Vacant";
    unit.tenant = null;
    await unit.save();
  }

  // Mark tenant as Former
  const tenant = await Tenant.findById(lease.tenant);
  if (tenant) {
    tenant.status = "Former";
    await tenant.save();
  }

  await logActivity({
    actor: req.user.id,
    action: "LEASE_ENDED",
    entity: "Lease",
    entityId: lease._id,
    meta: {
      leaseNumber: lease.leaseNumber,
      reason: reason || "No reason provided",
    },
  });

  res.status(200).json({
    success: true,
    message: "Lease terminated. Unit is now vacant.",
  });
};

// ─── POST /api/leases/:id/renew ───────────────────────────────────────────────
const renewLease = async (req, res) => {
  const { startDate, endDate, rentAmount, notes } = req.body;

  const oldLease = await Lease.findOne({
    _id: req.params.id,
    landlord: req.user.id,
  });
  if (!oldLease) throw new ApiError(404, "Lease not found");

  // Only active leases can be renewed
  if (oldLease.status !== "Active") {
    throw new ApiError(
      400,
      `Only active leases can be renewed. This lease is ${oldLease.status}.`,
    );
  }

  // Check new dates don't overlap with any other lease on the unit (excluding this one)
  const overlap = await hasOverlappingLease(
    oldLease.unit,
    new Date(startDate),
    new Date(endDate),
    oldLease._id,
  );
  if (overlap) {
    throw new ApiError(
      400,
      "New lease dates overlap with another existing lease for this unit.",
    );
  }

  const leaseNumber = await generateLeaseNumber();

  // Create the new lease — inherits most terms from old lease
  const newLease = await Lease.create({
    leaseNumber,
    tenant: oldLease.tenant,
    property: oldLease.property,
    unit: oldLease.unit,
    landlord: req.user.id,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    rentAmount: rentAmount || oldLease.rentAmount,
    securityDeposit: oldLease.securityDeposit,
    serviceCharge: oldLease.serviceCharge,
    paymentFrequency: oldLease.paymentFrequency,
    rentDueDay: oldLease.rentDueDay,
    gracePeriod: oldLease.gracePeriod,
    noticePeriod: oldLease.noticePeriod,
    currency: oldLease.currency,
    renewalOption: oldLease.renewalOption,
    renewedFrom: oldLease._id,
    notes: notes || null,
    status: "Active",
  });

  // Mark old lease as Renewed and point to new lease
  oldLease.status = "Renewed";
  oldLease.renewedTo = newLease._id;
  await oldLease.save();

  await logActivity({
    actor: req.user.id,
    action: "LEASE_RENEWED",
    entity: "Lease",
    entityId: newLease._id,
    meta: {
      oldLeaseNumber: oldLease.leaseNumber,
      newLeaseNumber: newLease.leaseNumber,
    },
  });

  const populated = await Lease.findById(newLease._id)
    .populate("tenant", "firstName lastName email")
    .populate("property", "name address")
    .populate("unit", "unitNumber unitType");

  res.status(201).json({
    success: true,
    message: "Lease renewed successfully",
    data: populated,
  });
};

// ─── PATCH /api/leases/:id/cancel ────────────────────────────────────────────
// Cancel a Draft or Pending lease that never became active
const cancelLease = async (req, res) => {
  const lease = await Lease.findOne({
    _id: req.params.id,
    landlord: req.user.id,
  });
  if (!lease) throw new ApiError(404, "Lease not found");

  if (!["Draft", "Pending"].includes(lease.status)) {
    throw new ApiError(
      400,
      `Only Draft or Pending leases can be cancelled. Use terminate for active leases.`,
    );
  }

  lease.status = "Cancelled";
  await lease.save();

  // Free the unit if it was reserved
  const unit = await Unit.findById(lease.unit);
  if (unit && unit.status !== "Occupied") {
    unit.status = "Vacant";
    unit.tenant = null;
    await unit.save();
  }

  res.status(200).json({
    success: true,
    message: "Lease cancelled successfully",
  });
};

// ─── GET /api/leases/expiring ─────────────────────────────────────────────────
// Returns leases expiring in the next 30 days — foundation for notifications
const getExpiringLeases = async (req, res) => {
  const now = new Date();
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  const leases = await Lease.find({
    landlord: req.user.id,
    status: "Active",
    endDate: { $gte: now, $lte: in30Days },
  })
    .populate("tenant", "firstName lastName email phone")
    .populate("property", "name")
    .populate("unit", "unitNumber")
    .sort({ endDate: 1 });

  // Tag each lease with how many days remaining
  const tagged = leases.map((l) => {
    const daysLeft = Math.ceil(
      (new Date(l.endDate) - now) / (1000 * 60 * 60 * 24),
    );
    return { ...l.toObject(), daysLeft };
  });

  res.status(200).json({
    success: true,
    count: tagged.length,
    data: tagged,
  });
};

module.exports = {
  createLease,
  getLeases,
  getLeaseById,
  terminateLease,
  renewLease,
  cancelLease,
  getExpiringLeases,
};
