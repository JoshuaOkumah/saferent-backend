const crypto = require("crypto");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Lease = require("../models/Lease");
const Unit = require("../models/Unit");
const Property = require("../models/Property");
const TenantInvitation = require("../models/TenantInvitation");
const ApiError = require("../utils/ApiError");
const { generateSecureToken } = require("../utils/token");
const {
  generateLeaseNumber,
  getActiveLeaseForUnit,
  hasOverlappingLease,
} = require("./lease.service");
const { sendEmail, tenantInvitationEmailHTML } = require("../utils/sendEmail");
const { logActivity } = require("./activityLog.service");

/**
 * The full atomic onboarding flow:
 * 1. Validate property + unit ownership and availability
 * 2. Check email is not already a RentSafe User account
 * 3. Create Tenant record
 * 4. Create User account (password = null, status = Pending Activation)
 * 5. Create Lease
 * 6. Update unit (Occupied)
 * 7. Generate activation token + TenantInvitation record
 * 8. Send invitation email
 */
const onboardTenant = async ({
  landlordId,
  landlordName,
  tenantData,
  leaseData,
}) => {
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
    propertyId,
    unitId,
  } = tenantData;

  const {
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
  } = leaseData;

  // ── 1. Verify property belongs to this landlord ───────────────────────────
  const property = await Property.findOne({
    _id: propertyId,
    owner: landlordId,
  });
  if (!property) throw new ApiError(404, "Property not found");
  if (property.status === "Archived")
    throw new ApiError(400, "Cannot onboard a tenant to an archived property");

  // ── 2. Verify unit belongs to this property ───────────────────────────────
  const unit = await Unit.findOne({
    _id: unitId,
    property: propertyId,
    owner: landlordId,
  });
  if (!unit) throw new ApiError(404, "Unit not found in this property");
  if (unit.isArchived)
    throw new ApiError(400, "Cannot onboard a tenant to an archived unit");
  if (unit.status === "Occupied")
    throw new ApiError(400, "This unit is already occupied");
  if (unit.status === "Under Maintenance")
    throw new ApiError(400, "This unit is under maintenance");

  // ── 3. No active lease on this unit ──────────────────────────────────────
  const existingActiveLease = await getActiveLeaseForUnit(unitId);
  if (existingActiveLease)
    throw new ApiError(400, "An active lease already exists for this unit");

  // ── 4. Check for overlapping dates ────────────────────────────────────────
  const overlap = await hasOverlappingLease(
    unitId,
    new Date(startDate),
    new Date(endDate),
  );
  if (overlap)
    throw new ApiError(
      400,
      "Lease dates overlap with an existing lease for this unit",
    );

  // ── 5. Email must not already be a RentSafe User account ─────────────────
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(
      409,
      "This email is already associated with a RentSafe account. The tenant can log in with their existing account.",
    );
  }

  // ── 6. Email must not already be used by another tenant of this landlord ──
  const existingTenant = await Tenant.findOne({ owner: landlordId, email });
  if (existingTenant) {
    throw new ApiError(
      409,
      "A tenant with this email already exists in your account",
    );
  }

  // ── 7. Create Tenant record ───────────────────────────────────────────────
  const tenant = await Tenant.create({
    owner: landlordId,
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
    status: "Pending Activation",
  });

  // ── 8. Create User account (no password, pending activation) ─────────────
  const userAccount = await User.create({
    name: `${firstName} ${lastName}`,
    email,
    phone,
    password: null,
    role: "tenant",
    provider: "local",
    isVerified: false,
    accountStatus: "Pending Activation",
    createdBy: landlordId,
    tenantProfile: tenant._id,
  });

  // Link User account back to Tenant
  tenant.userAccount = userAccount._id;
  await tenant.save();

  // ── 9. Create Lease ───────────────────────────────────────────────────────
  const leaseNumber = await generateLeaseNumber();
  const lease = await Lease.create({
    leaseNumber,
    tenant: tenant._id,
    property: propertyId,
    unit: unitId,
    landlord: landlordId,
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
    notes: leaseNotes || null,
    status: "Active",
  });

  // ── 10. Update unit ───────────────────────────────────────────────────────
  unit.status = "Occupied";
  unit.tenant = tenant._id;
  await unit.save();

  // ── 11. Generate activation token ─────────────────────────────────────────
  const { plain: activationToken, hash: tokenHash } =
    await generateSecureToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Cancel any previous pending invitations for this tenant (safety)
  await TenantInvitation.updateMany(
    { tenant: tenant._id, status: "Pending" },
    { status: "Cancelled" },
  );

  const invitation = await TenantInvitation.create({
    tenant: tenant._id,
    userAccount: userAccount._id,
    invitedBy: landlordId,
    email,
    tokenHash,
    expiresAt,
    status: "Pending",
    propertyName: property.name,
    unitNumber: unit.unitNumber,
    landlordName,
  });

  // ── 12. Send invitation email ──────────────────────────────────────────────
  const activationUrl = `${process.env.CLIENT_URL}/activate?token=${activationToken}&email=${encodeURIComponent(email)}`;

  await sendEmail({
    to: email,
    subject: `You've been invited to RentSafe by ${landlordName}`,
    html: tenantInvitationEmailHTML({
      landlordName,
      propertyName: property.name,
      unitNumber: unit.unitNumber,
      activationUrl,
      tenantFirstName: firstName,
    }),
  });

  await logActivity({
    actor: landlordId,
    action: "TENANT_CREATED",
    entity: "Tenant",
    entityId: tenant._id,
    meta: {
      name: `${firstName} ${lastName}`,
      email,
      leaseNumber,
      unitNumber: unit.unitNumber,
      propertyName: property.name,
    },
  });

  return { tenant, lease, invitation };
};

module.exports = { onboardTenant };
