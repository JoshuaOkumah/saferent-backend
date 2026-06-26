const Unit = require("../models/Unit");
const Property = require("../models/Property");
const ApiError = require("../utils/ApiError");
const { logActivity } = require("../services/activityLog.service");

// ─── Helper: verify property belongs to this landlord ─────────────────────────
const assertPropertyOwnership = async (propertyId, userId) => {
  const property = await Property.findOne({ _id: propertyId, owner: userId });
  if (!property) throw new ApiError(404, "Property not found");
  if (property.status === "Archived")
    throw new ApiError(400, "Cannot modify units of an archived property");
  return property;
};

// ─── POST /api/properties/:propertyId/units ───────────────────────────────────
const createUnit = async (req, res) => {
  const { propertyId } = req.params;
  await assertPropertyOwnership(propertyId, req.user.id);

  const {
    unitNumber,
    unitType,
    bedrooms,
    bathrooms,
    rentAmount,
    serviceCharge,
    securityDeposit,
    notes,
  } = req.body;

  // Prevent duplicate unit numbers within the same property
  const exists = await Unit.findOne({ property: propertyId, unitNumber });
  if (exists)
    throw new ApiError(
      409,
      `Unit number "${unitNumber}" already exists in this property`,
    );

  const unit = await Unit.create({
    property: propertyId,
    owner: req.user.id,
    unitNumber,
    unitType,
    bedrooms: bedrooms || 0,
    bathrooms: bathrooms || 0,
    rentAmount,
    serviceCharge: serviceCharge || 0,
    securityDeposit: securityDeposit || 0,
    notes: notes || null,
  });

  await logActivity({
    actor: req.user.id,
    action: "UNIT_CREATED",
    entity: "Unit",
    entityId: unit._id,
    meta: { unitNumber, propertyId },
  });

  res.status(201).json({
    success: true,
    message: "Unit created successfully",
    data: unit,
  });
};

// ─── POST /api/properties/:propertyId/units/bulk ──────────────────────────────
const bulkCreateUnits = async (req, res) => {
  const { propertyId } = req.params;
  await assertPropertyOwnership(propertyId, req.user.id);

  const { units } = req.body; // array of unit objects

  // Check for duplicate unit numbers within the request itself
  const incomingNumbers = units.map((u) => u.unitNumber);
  const hasDuplicatesInRequest =
    new Set(incomingNumbers).size !== incomingNumbers.length;
  if (hasDuplicatesInRequest) {
    throw new ApiError(400, "Duplicate unit numbers found in your request");
  }

  // Check against existing units in the property
  const existing = await Unit.find({
    property: propertyId,
    unitNumber: { $in: incomingNumbers },
  }).select("unitNumber");

  if (existing.length > 0) {
    const taken = existing.map((u) => u.unitNumber).join(", ");
    throw new ApiError(
      409,
      `These unit numbers already exist in this property: ${taken}`,
    );
  }

  const toInsert = units.map((u) => ({
    property: propertyId,
    owner: req.user.id,
    unitNumber: u.unitNumber,
    unitType: u.unitType,
    bedrooms: u.bedrooms || 0,
    bathrooms: u.bathrooms || 0,
    rentAmount: u.rentAmount,
    serviceCharge: u.serviceCharge || 0,
    securityDeposit: u.securityDeposit || 0,
    notes: u.notes || null,
  }));

  const created = await Unit.insertMany(toInsert);

  await logActivity({
    actor: req.user.id,
    action: "UNIT_CREATED",
    entity: "Unit",
    entityId: propertyId,
    meta: { count: created.length, propertyId },
  });

  res.status(201).json({
    success: true,
    message: `${created.length} units created successfully`,
    data: created,
  });
};

// ─── GET /api/properties/:propertyId/units ────────────────────────────────────
const getUnits = async (req, res) => {
  const { propertyId } = req.params;
  await assertPropertyOwnership(propertyId, req.user.id);

  const { status } = req.query;
  const filter = { property: propertyId, isArchived: false };
  if (status) filter.status = status;

  const units = await Unit.find(filter)
    .populate("tenant", "name email phone")
    .sort({ unitNumber: 1 });

  res.status(200).json({
    success: true,
    count: units.length,
    data: units,
  });
};

// ─── GET /api/units/:id ───────────────────────────────────────────────────────
const getUnitById = async (req, res) => {
  const unit = await Unit.findOne({ _id: req.params.id, owner: req.user.id })
    .populate("property", "name address")
    .populate("tenant", "name email phone");

  if (!unit) throw new ApiError(404, "Unit not found");

  res.status(200).json({ success: true, data: unit });
};

// ─── PUT /api/units/:id ───────────────────────────────────────────────────────
const updateUnit = async (req, res) => {
  const unit = await Unit.findOne({ _id: req.params.id, owner: req.user.id });
  if (!unit) throw new ApiError(404, "Unit not found");
  if (unit.isArchived)
    throw new ApiError(400, "Cannot update an archived unit");

  // Protect tenant and status from direct edits — those go through lease/tenant flows
  const { tenant, status, property, owner, ...updates } = req.body;

  // If unitNumber is being changed, check it won't clash
  if (updates.unitNumber && updates.unitNumber !== unit.unitNumber) {
    const clash = await Unit.findOne({
      property: unit.property,
      unitNumber: updates.unitNumber,
    });
    if (clash)
      throw new ApiError(
        409,
        `Unit number "${updates.unitNumber}" already exists in this property`,
      );
  }

  Object.assign(unit, updates);
  await unit.save();

  await logActivity({
    actor: req.user.id,
    action: "UNIT_UPDATED",
    entity: "Unit",
    entityId: unit._id,
    meta: { updates },
  });

  res.status(200).json({
    success: true,
    message: "Unit updated successfully",
    data: unit,
  });
};

// ─── PATCH /api/units/:id/status ──────────────────────────────────────────────
// Manually set status to Reserved or Under Maintenance
const updateUnitStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ["Reserved", "Under Maintenance", "Vacant"];

  if (!allowed.includes(status)) {
    throw new ApiError(
      400,
      `You can only manually set status to: ${allowed.join(", ")}`,
    );
  }

  const unit = await Unit.findOne({ _id: req.params.id, owner: req.user.id });
  if (!unit) throw new ApiError(404, "Unit not found");
  if (unit.isArchived)
    throw new ApiError(400, "Cannot update an archived unit");

  // Can't manually override an occupied unit
  if (unit.status === "Occupied") {
    throw new ApiError(
      400,
      "Cannot change status of an occupied unit. End the lease first.",
    );
  }

  unit.status = status;
  await unit.save();

  res.status(200).json({
    success: true,
    message: `Unit status updated to ${status}`,
    data: unit,
  });
};

// ─── DELETE /api/units/:id ────────────────────────────────────────────────────
// Soft delete only
const archiveUnit = async (req, res) => {
  const unit = await Unit.findOne({ _id: req.params.id, owner: req.user.id });
  if (!unit) throw new ApiError(404, "Unit not found");

  if (unit.status === "Occupied") {
    throw new ApiError(
      400,
      "Cannot archive an occupied unit. Vacate the tenant first.",
    );
  }

  unit.isArchived = true;
  await unit.save();

  await logActivity({
    actor: req.user.id,
    action: "UNIT_ARCHIVED",
    entity: "Unit",
    entityId: unit._id,
    meta: { unitNumber: unit.unitNumber },
  });

  res.status(200).json({
    success: true,
    message: "Unit archived successfully",
  });
};

// ─── PATCH /api/units/:id/transfer ───────────────────────────────────────────
// Move a tenant from one unit to another within the landlord's properties
const transferTenant = async (req, res) => {
  const { newUnitId } = req.body;
  if (!newUnitId) throw new ApiError(400, "newUnitId is required");

  const [currentUnit, newUnit] = await Promise.all([
    Unit.findOne({ _id: req.params.id, owner: req.user.id }),
    Unit.findOne({ _id: newUnitId, owner: req.user.id }),
  ]);

  if (!currentUnit) throw new ApiError(404, "Current unit not found");
  if (!newUnit) throw new ApiError(404, "Target unit not found");

  if (currentUnit.status !== "Occupied") {
    throw new ApiError(400, "Current unit has no tenant to transfer");
  }
  if (newUnit.status !== "Vacant") {
    throw new ApiError(400, "Target unit must be vacant before transfer");
  }

  const tenantId = currentUnit.tenant;

  // Vacate old unit
  currentUnit.tenant = null;
  currentUnit.status = "Vacant";

  // Assign to new unit
  newUnit.tenant = tenantId;
  newUnit.status = "Occupied";

  await Promise.all([currentUnit.save(), newUnit.save()]);

  await logActivity({
    actor: req.user.id,
    action: "TENANT_TRANSFERRED",
    entity: "Unit",
    entityId: currentUnit._id,
    meta: {
      tenantId,
      fromUnit: currentUnit.unitNumber,
      toUnit: newUnit.unitNumber,
    },
  });

  res.status(200).json({
    success: true,
    message: `Tenant transferred from ${currentUnit.unitNumber} to ${newUnit.unitNumber}`,
  });
};

module.exports = {
  createUnit,
  bulkCreateUnits,
  getUnits,
  getUnitById,
  updateUnit,
  updateUnitStatus,
  archiveUnit,
  transferTenant,
};
