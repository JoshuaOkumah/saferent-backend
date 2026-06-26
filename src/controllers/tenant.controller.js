const Tenant = require("../models/Tenant");
const Lease = require("../models/Lease");
const Unit = require("../models/Unit");
const Property = require("../models/Property");
const ApiError = require("../utils/ApiError");
const { logActivity } = require("../services/activityLog.service");

// ─── POST /api/tenants ────────────────────────────────────────────────────────
const createTenant = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    alternatePhone,
    gender,
    dateOfBirth,
    nationality,
    occupation,
    employer,
    workAddress,
    emergencyContact,
    guarantor,
    governmentIdType,
    governmentIdNumber,
    notes,
  } = req.body;

  // Block duplicate email under the same landlord
  const existing = await Tenant.findOne({ owner: req.user.id, email });
  if (existing) {
    throw new ApiError(
      409,
      "A tenant with this email already exists in your account",
    );
  }

  const tenant = await Tenant.create({
    owner: req.user.id,
    firstName,
    lastName,
    email,
    phone,
    alternatePhone: alternatePhone || null,
    gender: gender || null,
    dateOfBirth: dateOfBirth || null,
    nationality: nationality || "Nigerian",
    occupation: occupation || null,
    employer: employer || null,
    workAddress: workAddress || null,
    emergencyContact: emergencyContact || null,
    guarantor: guarantor || null,
    governmentIdType: governmentIdType || null,
    governmentIdNumber: governmentIdNumber || null,
    notes: notes || null,
    status: "Former", // becomes Active when lease is created
  });

  await logActivity({
    actor: req.user.id,
    action: "TENANT_CREATED",
    entity: "Tenant",
    entityId: tenant._id,
    meta: { name: `${firstName} ${lastName}`, email },
  });

  res.status(201).json({
    success: true,
    message: "Tenant created successfully",
    data: tenant,
  });
};

// ─── GET /api/tenants ─────────────────────────────────────────────────────────
const getTenants = async (req, res) => {
  const { page = 1, limit = 10, search, status, propertyId } = req.query;

  const filter = { owner: req.user.id };

  if (status) filter.status = status;

  // Text search across name, email, phone, occupation, ID number
  if (search) {
    const regex = new RegExp(search, "i");
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex },
      { occupation: regex },
      { governmentIdNumber: regex },
    ];
  }

  // Filter by property — find all tenants with an active lease on that property
  if (propertyId) {
    const leases = await Lease.find({
      property: propertyId,
      landlord: req.user.id,
      status: "Active",
    }).select("tenant");
    const tenantIds = leases.map((l) => l.tenant);
    filter._id = { $in: tenantIds };
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [tenants, total] = await Promise.all([
    Tenant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Tenant.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: tenants,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  });
};

// ─── GET /api/tenants/:id ─────────────────────────────────────────────────────
// Full tenant profile — current lease, lease history, unit, payments, maintenance
const getTenantById = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  // Full lease history
  const leases = await Lease.find({ tenant: tenant._id, landlord: req.user.id })
    .populate("property", "name address")
    .populate("unit", "unitNumber unitType rentAmount")
    .sort({ createdAt: -1 });

  // Current active lease
  const activeLease = leases.find((l) => l.status === "Active") || null;

  res.status(200).json({
    success: true,
    data: {
      ...tenant.toObject(),
      activeLease,
      leaseHistory: leases,
    },
  });
};

// ─── PUT /api/tenants/:id ─────────────────────────────────────────────────────
const updateTenant = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  if (tenant.status === "Archived") {
    throw new ApiError(400, "Cannot update an archived tenant");
  }

  // Block email change to one already used by another tenant of this landlord
  if (req.body.email && req.body.email !== tenant.email) {
    const clash = await Tenant.findOne({
      owner: req.user.id,
      email: req.body.email,
    });
    if (clash)
      throw new ApiError(
        409,
        "Another tenant with this email already exists in your account",
      );
  }

  // Strip protected fields
  const { owner, status: rawStatus, ...updates } = req.body;

  // Status can only be set to Blacklisted manually — Active/Former/Archived are system-controlled
  if (rawStatus && rawStatus === "Blacklisted") {
    updates.status = "Blacklisted";
  }

  Object.assign(tenant, updates);
  await tenant.save();

  await logActivity({
    actor: req.user.id,
    action: "TENANT_UPDATED",
    entity: "Tenant",
    entityId: tenant._id,
    meta: { updates: Object.keys(updates) },
  });

  res.status(200).json({
    success: true,
    message: "Tenant updated successfully",
    data: tenant,
  });
};

// ─── DELETE /api/tenants/:id ──────────────────────────────────────────────────
// Soft delete — archive only. Block if active lease exists.
const archiveTenant = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  if (tenant.status === "Archived") {
    throw new ApiError(400, "Tenant is already archived");
  }

  // Block deletion if they have an active lease
  const activeLease = await Lease.findOne({
    tenant: tenant._id,
    status: "Active",
  });
  if (activeLease) {
    throw new ApiError(
      400,
      "Cannot archive a tenant with an active lease. Terminate the lease first.",
    );
  }

  tenant.status = "Archived";
  await tenant.save();

  await logActivity({
    actor: req.user.id,
    action: "TENANT_ARCHIVED",
    entity: "Tenant",
    entityId: tenant._id,
    meta: { name: `${tenant.firstName} ${tenant.lastName}` },
  });

  res.status(200).json({
    success: true,
    message: "Tenant archived successfully",
  });
};

module.exports = {
  createTenant,
  getTenants,
  getTenantById,
  updateTenant,
  archiveTenant,
};
