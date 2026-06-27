const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Lease = require("../models/Lease");
const Unit = require("../models/Unit");
const TenantInvitation = require("../models/TenantInvitation");
const ApiError = require("../utils/ApiError");

const { logActivity } = require("../services/activityLog.service");
const { onboardTenant } = require("../services/tenantOnboarding.service");
const { generateSecureToken, verifySecureToken } = require("../utils/token");
const {
  sendEmail,
  tenantInvitationEmailHTML,
  tenantAccountActivatedEmailHTML,
} = require("../utils/sendEmail");
const validatePassword = require("../utils/validatePassword");
const { generateToken } = require("../utils/jwt");

// ─── POST /api/tenants/onboard ────────────────────────────────────────────────
// Landlord creates tenant + lease + sends invite in one atomic call
const onboardNewTenant = async (req, res) => {
  const landlord = await User.findById(req.user.id);

  const {
    // Tenant fields
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
    propertyId,
    unitId,
    // Lease fields
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
    leaseNotes,
  } = req.body;

  const { tenant, lease, invitation } = await onboardTenant({
    landlordId: req.user.id,
    landlordName: landlord.name,
    tenantData: {
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
      propertyId,
      unitId,
    },
    leaseData: {
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
      leaseNotes,
    },
  });

  res.status(201).json({
    success: true,
    message: `Tenant created and invitation sent to ${email}`,
    data: {
      tenant,
      lease: { leaseNumber: lease.leaseNumber, status: lease.status },
      invitation: {
        id: invitation._id,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    },
  });
};

// ─── POST /api/tenants/:id/resend-invite ──────────────────────────────────────
const resendInvitation = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  if (tenant.status !== "Pending Activation") {
    throw new ApiError(400, "This tenant has already activated their account");
  }

  const landlord = await User.findById(req.user.id);

  // Get active lease to pull property/unit context
  const lease = await Lease.findOne({ tenant: tenant._id, status: "Active" })
    .populate("property", "name")
    .populate("unit", "unitNumber");

  if (!lease) throw new ApiError(400, "No active lease found for this tenant");

  // Cancel all previous pending invitations
  await TenantInvitation.updateMany(
    { tenant: tenant._id, status: "Pending" },
    { status: "Cancelled" },
  );

  // Generate a fresh token
  const { plain: activationToken, hash: tokenHash } =
    await generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const invitation = await TenantInvitation.create({
    tenant: tenant._id,
    userAccount: tenant.userAccount,
    invitedBy: req.user.id,
    email: tenant.email,
    tokenHash,
    expiresAt,
    status: "Pending",
    propertyName: lease.property.name,
    unitNumber: lease.unit.unitNumber,
    landlordName: landlord.name,
  });

  const activationUrl = `${process.env.CLIENT_URL}/activate?token=${activationToken}&email=${encodeURIComponent(tenant.email)}`;

  await sendEmail({
    to: tenant.email,
    subject: `Reminder: Activate your RentSafe account`,
    html: tenantInvitationEmailHTML({
      landlordName: landlord.name,
      propertyName: lease.property.name,
      unitNumber: lease.unit.unitNumber,
      activationUrl,
      tenantFirstName: tenant.firstName,
    }),
  });

  res.status(200).json({
    success: true,
    message: `Invitation resent to ${tenant.email}`,
    data: { expiresAt: invitation.expiresAt },
  });
};

// ─── PATCH /api/tenants/:id/cancel-invite ─────────────────────────────────────
const cancelInvitation = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  if (tenant.status !== "Pending Activation") {
    throw new ApiError(400, "No pending invitation to cancel for this tenant");
  }

  await TenantInvitation.updateMany(
    { tenant: tenant._id, status: "Pending" },
    { status: "Cancelled" },
  );

  res.status(200).json({
    success: true,
    message: "Invitation cancelled successfully",
  });
};

// ─── POST /api/tenants/activate ───────────────────────────────────────────────
// Public endpoint — tenant clicks email link and sets their password
const activateAccount = async (req, res) => {
  const { token, email, password, confirmPassword } = req.body;

  if (!token || !email || !password || !confirmPassword) {
    throw new ApiError(
      400,
      "Token, email, password, and confirmPassword are required",
    );
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  validatePassword(password);

  // Find the most recent pending invitation for this email
  const invitation = await TenantInvitation.findOne({
    email,
    status: "Pending",
  })
    .select("+tokenHash")
    .sort({ createdAt: -1 });

  if (!invitation) {
    throw new ApiError(
      400,
      "Invalid or expired activation link. Please ask your landlord to resend the invitation.",
    );
  }

  if (invitation.expiresAt < Date.now()) {
    invitation.status = "Expired";
    await invitation.save();
    throw new ApiError(
      400,
      "This activation link has expired. Please ask your landlord to resend the invitation.",
    );
  }

  const isValid = await verifySecureToken(token, invitation.tokenHash);
  if (!isValid) {
    throw new ApiError(400, "Invalid activation link.");
  }

  // Activate the User account
  const userAccount = await User.findById(invitation.userAccount).select(
    "+password",
  );
  if (!userAccount) throw new ApiError(404, "Account not found");

  userAccount.password = password; // pre-save hook hashes it
  userAccount.isVerified = true;
  userAccount.accountStatus = "Active";
  await userAccount.save();

  // Mark invitation as accepted
  invitation.status = "Accepted";
  invitation.acceptedAt = new Date();
  await invitation.save();

  // Update tenant status
  const tenant = await Tenant.findById(invitation.tenant);
  if (tenant && tenant.status === "Pending Activation") {
    tenant.status = "Active";
    await tenant.save();
  }

  // Send confirmation email
  await sendEmail({
    to: email,
    subject: "Your RentSafe account is now active",
    html: tenantAccountActivatedEmailHTML(tenant?.firstName || "Tenant"),
  });

  const jwtToken = generateToken({
    id: userAccount._id,
    role: userAccount.role,
  });

  res.status(200).json({
    success: true,
    message: "Account activated successfully. Welcome to RentSafe.",
    token: jwtToken,
    user: {
      _id: userAccount._id,
      name: userAccount.name,
      email: userAccount.email,
      role: userAccount.role,
      tenantProfile: userAccount.tenantProfile,
    },
  });
};

// ─── GET /api/tenants/me ──────────────────────────────────────────────────────
// Tenant dashboard — scoped, sees only their own data
const getMyTenantDashboard = async (req, res) => {
  if (req.user.role !== "tenant") {
    throw new ApiError(403, "This endpoint is for tenants only");
  }

  const userAccount = await User.findById(req.user.id);
  if (!userAccount || !userAccount.tenantProfile) {
    throw new ApiError(404, "Tenant profile not found");
  }

  const tenant = await Tenant.findById(userAccount.tenantProfile);
  if (!tenant) throw new ApiError(404, "Tenant profile not found");

  // Active lease with full context
  const activeLease = await Lease.findOne({
    tenant: tenant._id,
    status: "Active",
  })
    .populate("property", "name address city state")
    .populate("unit", "unitNumber unitType rentAmount serviceCharge")
    .populate("landlord", "name email phone");

  // Full lease history
  const leaseHistory = await Lease.find({ tenant: tenant._id })
    .populate("property", "name address")
    .populate("unit", "unitNumber unitType")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: {
      profile: {
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        email: tenant.email,
        phone: tenant.phone,
        profilePhoto: tenant.profilePhoto,
        status: tenant.status,
      },
      activeLease,
      leaseHistory,
    },
  });
};

// ─── GET /api/tenants ─────────────────────────────────────────────────────────
const getTenants = async (req, res) => {
  const { page = 1, limit = 10, search, status, propertyId } = req.query;

  const filter = { owner: req.user.id };
  if (status) filter.status = status;

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

  if (propertyId) {
    const leases = await Lease.find({
      property: propertyId,
      landlord: req.user.id,
      status: "Active",
    }).select("tenant");
    filter._id = { $in: leases.map((l) => l.tenant) };
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
const getTenantById = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  const leases = await Lease.find({ tenant: tenant._id, landlord: req.user.id })
    .populate("property", "name address")
    .populate("unit", "unitNumber unitType rentAmount")
    .sort({ createdAt: -1 });

  const activeLease = leases.find((l) => l.status === "Active") || null;

  // Invitation status
  const latestInvitation = await TenantInvitation.findOne({
    tenant: tenant._id,
  })
    .sort({ createdAt: -1 })
    .select("-tokenHash");

  res.status(200).json({
    success: true,
    data: {
      ...tenant.toObject(),
      activeLease,
      leaseHistory: leases,
      invitation: latestInvitation || null,
    },
  });
};

// ─── PUT /api/tenants/:id ─────────────────────────────────────────────────────
// ─── PUT /api/tenants/:id ─────────────────────────────────────────────────────
// ─── PUT /api/tenants/:id ─────────────────────────────────────────────────────
const updateTenant = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");
  if (tenant.status === "Archived")
    throw new ApiError(400, "Cannot update an archived tenant");

  // Email change requires re-verification
  if (req.body.email && req.body.email !== tenant.email) {
    const clash = await Tenant.findOne({
      owner: req.user.id,
      email: req.body.email,
      _id: { $ne: tenant._id },
    });
    if (clash)
      throw new ApiError(409, "Another tenant with this email already exists");

    const userClash = await User.findOne({ email: req.body.email });
    if (userClash) {
      throw new ApiError(
        409,
        "This email is already associated with a RentSafe account",
      );
    }

    if (tenant.userAccount) {
      await User.findByIdAndUpdate(tenant.userAccount, {
        email: req.body.email,
        isVerified: false,
        accountStatus: "Pending Activation",
      });
    }
    tenant.status = "Pending Activation";
  }

  // Explicit whitelist — ONLY these fields can be updated by a landlord
  // Gender, dateOfBirth, nationality, governmentIdType, governmentIdNumber,
  // profilePhoto, internalNotes visibility are all tenant-only or system fields
  const allowedFields = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "alternatePhone",
    "occupation",
    "employer",
    "workAddress",
    "emergencyContact",
    "guarantor",
    "notes",
    "internalNotes",
  ];

  // Only Blacklisted can be set manually by landlord
  if (req.body.status === "Blacklisted") {
    tenant.status = "Blacklisted";
  }

  // Build updates object strictly from whitelist — nothing else gets through
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  // Apply only the whitelisted updates
  Object.assign(tenant, updates);
  await tenant.save();

  await logActivity({
    actor: req.user.id,
    action: "TENANT_UPDATED",
    entity: "Tenant",
    entityId: tenant._id,
    meta: { updatedBy: "landlord", fields: Object.keys(updates) },
  });

  res.status(200).json({
    success: true,
    message: "Tenant updated successfully",
    data: tenant,
  });
};
// ─── DELETE /api/tenants/:id ──────────────────────────────────────────────────
const archiveTenant = async (req, res) => {
  const tenant = await Tenant.findOne({
    _id: req.params.id,
    owner: req.user.id,
  });
  if (!tenant) throw new ApiError(404, "Tenant not found");

  if (tenant.status === "Archived")
    throw new ApiError(400, "Tenant is already archived");

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

  // Also suspend the User account
  if (tenant.userAccount) {
    await User.findByIdAndUpdate(tenant.userAccount, {
      accountStatus: "Suspended",
    });
  }

  // Cancel pending invitations
  await TenantInvitation.updateMany(
    { tenant: tenant._id, status: "Pending" },
    { status: "Cancelled" },
  );

  await logActivity({
    actor: req.user.id,
    action: "TENANT_ARCHIVED",
    entity: "Tenant",
    entityId: tenant._id,
    meta: { name: `${tenant.firstName} ${tenant.lastName}` },
  });

  res
    .status(200)
    .json({ success: true, message: "Tenant archived successfully" });
};

// ─── Helper: strip landlord-only fields from tenant-facing response ────────────
const sanitizeTenantForSelf = (tenant) => {
  const obj = tenant.toObject ? tenant.toObject() : { ...tenant };
  delete obj.internalNotes; // tenant never sees internal notes
  delete obj.owner;
  delete obj.userAccount;
  delete obj.createdBy;
  return obj;
};

// ─── GET /api/tenants/me/profile ──────────────────────────────────────────────
// Tenant views their own full profile (personal fields only)
const getMyProfile = async (req, res) => {
  const userAccount = await User.findById(req.user.id);
  if (!userAccount?.tenantProfile)
    throw new ApiError(404, "Tenant profile not found");

  const tenant = await Tenant.findById(userAccount.tenantProfile);
  if (!tenant) throw new ApiError(404, "Tenant profile not found");

  // Active lease context — tenant needs to see their property and unit
  const activeLease = await Lease.findOne({
    tenant: tenant._id,
    status: "Active",
  })
    .populate("property", "name address city state")
    .populate(
      "unit",
      "unitNumber unitType rentAmount serviceCharge securityDeposit",
    )
    .populate("landlord", "name email phone");

  res.status(200).json({
    success: true,
    data: {
      profile: sanitizeTenantForSelf(tenant),
      activeLease,
    },
  });
};

// ─── PATCH /api/tenants/me/profile ────────────────────────────────────────────
// Tenant updates their own personal fields
const updateMyProfile = async (req, res) => {
  const userAccount = await User.findById(req.user.id);
  if (!userAccount?.tenantProfile)
    throw new ApiError(404, "Tenant profile not found");

  const tenant = await Tenant.findById(userAccount.tenantProfile);
  if (!tenant) throw new ApiError(404, "Tenant profile not found");

  if (tenant.status === "Archived") {
    throw new ApiError(
      400,
      "Your account has been archived. Contact your landlord.",
    );
  }

  // Handle email change carefully — mark as unverified until confirmed
  if (req.body.email && req.body.email !== tenant.email) {
    const emailClash = await User.findOne({ email: req.body.email });
    if (emailClash)
      throw new ApiError(
        409,
        "This email is already associated with a RentSafe account",
      );

    const tenantClash = await Tenant.findOne({
      owner: tenant.owner,
      email: req.body.email,
      _id: { $ne: tenant._id },
    });
    if (tenantClash) throw new ApiError(409, "This email is already in use");

    // Update User account email and mark as pending re-verification
    userAccount.email = req.body.email;
    userAccount.isVerified = false;
    userAccount.accountStatus = "Pending Activation";
    await userAccount.save();

    // Tenant status goes back to Pending Activation until new email verified
    req.body.status = "Pending Activation";
  }

  // Only allow the tenant-permitted fields through
  const allowedFields = [
    "firstName",
    "lastName",
    "phone",
    "alternatePhone",
    "gender",
    "dateOfBirth",
    "nationality",
    "occupation",
    "employer",
    "workAddress",
    "emergencyContact",
    "governmentIdType",
    "governmentIdNumber",
    "email",
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  Object.assign(tenant, updates);
  await tenant.save();

  // Sync name on User account if name fields changed
  if (updates.firstName || updates.lastName) {
    userAccount.name = `${tenant.firstName} ${tenant.lastName}`;
    await userAccount.save();
  }

  await logActivity({
    actor: req.user.id,
    action: "TENANT_UPDATED",
    entity: "Tenant",
    entityId: tenant._id,
    meta: { updatedBy: "tenant", fields: Object.keys(updates) },
  });

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: sanitizeTenantForSelf(tenant),
  });
};

// ─── PATCH /api/tenants/me/password ───────────────────────────────────────────
// Tenant changes their own password
const changeMyPassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const userAccount = await User.findById(req.user.id).select("+password");
  if (!userAccount) throw new ApiError(404, "Account not found");

  if (!userAccount.password) {
    throw new ApiError(
      400,
      "Your account was created via Google and has no password to change.",
    );
  }

  const isMatch = await userAccount.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(401, "Current password is incorrect");

  validatePassword(newPassword);

  if (currentPassword === newPassword) {
    throw new ApiError(
      400,
      "New password must be different from your current password",
    );
  }

  userAccount.password = newPassword; // pre-save hook hashes it
  await userAccount.save();

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
};

module.exports = {
  onboardNewTenant,
  activateAccount,
  resendInvitation,
  cancelInvitation,
  getMyTenantDashboard,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  getTenants,
  getTenantById,
  updateTenant,
  archiveTenant,
};
