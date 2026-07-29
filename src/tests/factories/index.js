const mongoose = require("mongoose");
const User = require("../../../src/models/User");
const Tenant = require("../../../src/models/Tenant");
const Property = require("../../../src/models/Property");
const Unit = require("../../../src/models/Unit");
const Lease = require("../../../src/models/Lease");
const TenantInvitation = require("../../../src/models/TenantInvitation");
const RentalAgreement = require("../../../src/models/RentalAgreement");

// ─── Property factory ─────────────────────────────────────────────────────────
const createProperty = async (ownerId, overrides = {}) => {
  return Property.create({
    owner: ownerId,
    name: "Test Property",
    propertyType: "Block of Flats",
    address: "No 12 Test Street",
    city: "Owerri",
    state: "Imo",
    country: "Nigeria",
    status: "Active",
    ...overrides,
  });
};

// ─── Unit factory ─────────────────────────────────────────────────────────────
const createUnit = async (propertyId, ownerId, overrides = {}) => {
  return Unit.create({
    property: propertyId,
    owner: ownerId,
    unitNumber: `Flat-${Math.floor(Math.random() * 9000) + 1000}`,
    unitType: "2 Bedroom",
    rentAmount: 500000,
    serviceCharge: 50000,
    securityDeposit: 100000,
    status: "Vacant",
    ...overrides,
  });
};

// ─── Tenant factory ───────────────────────────────────────────────────────────
const createTenant = async (ownerId, overrides = {}) => {
  const unique = Math.floor(Math.random() * 9000) + 1000;
  return Tenant.create({
    owner: ownerId,
    firstName: "John",
    lastName: "Doe",
    email: overrides.email || `tenant${unique}@test.com`,
    phone: "08099887766",
    status: "Former",
    ...overrides,
  });
};

// ─── Tenant user account factory ──────────────────────────────────────────────
const createTenantUserAccount = async (tenantId, ownerId, overrides = {}) => {
  const unique = Math.floor(Math.random() * 9000) + 1000;
  const user = await User.create({
    name: "John Doe",
    email: overrides.email || `tenantuser${unique}@test.com`,
    phone: "08099887766",
    password: "Tenant@Test1",
    role: "tenant",
    provider: "local",
    isVerified: true,
    accountStatus: "Active",
    createdBy: ownerId,
    tenantProfile: tenantId,
    ...overrides,
  });

  // Link back to tenant
  await Tenant.findByIdAndUpdate(tenantId, { userAccount: user._id });

  return user;
};

// ─── Lease factory ────────────────────────────────────────────────────────────
const createLease = async (
  tenantId,
  propertyId,
  unitId,
  landlordId,
  overrides = {},
) => {
  const year = new Date().getFullYear();
  const leaseNumber = `LS-${year}-${Math.floor(Math.random() * 9000) + 1000}`;

  return Lease.create({
    leaseNumber,
    tenant: tenantId,
    property: propertyId,
    unit: unitId,
    landlord: landlordId,
    startDate: new Date("2026-07-01"),
    endDate: new Date("2027-06-30"),
    rentAmount: 500000,
    securityDeposit: 100000,
    serviceCharge: 50000,
    paymentFrequency: "Annually",
    rentDueDay: 1,
    gracePeriod: 7,
    noticePeriod: 30,
    status: "Pending",
    ...overrides,
  });
};

// ─── Active lease factory (both signed, unit occupied) ────────────────────────
const createActiveLease = async (
  tenantId,
  propertyId,
  unitId,
  landlordId,
  overrides = {},
) => {
  const lease = await createLease(tenantId, propertyId, unitId, landlordId, {
    status: "Active",
    ...overrides,
  });

  // Occupy the unit
  await Unit.findByIdAndUpdate(unitId, {
    status: "Occupied",
    tenant: tenantId,
  });

  // Activate the tenant
  await Tenant.findByIdAndUpdate(tenantId, { status: "Active" });

  return lease;
};

// ─── RentalAgreement factory (pending, no document) ───────────────────────────
// ─── RentalAgreement factory (pending, no document) ───────────────────────────
const createAgreement = async (
  leaseId,
  landlordId,
  tenantId,
  unitId,
  propertyId,
  overrides = {},
) => {
  const year = new Date().getFullYear();
  const ref = `RS-AGR-${year}-${Math.floor(Math.random() * 900000) + 100000}`;

  const agreement = await RentalAgreement.create({
    lease: leaseId,
    agreementReference: ref,
    agreementType: "Annually",
    currentVersion: 1,
    versions: [
      {
        version: 1,
        documentHash: "testhash123abc",
        pdfChecksum: "testchecksum456def",
        cloudinary: {
          publicId: "rentsafe/agreements/test-doc",
          secureUrl: "https://res.cloudinary.com/test/test-doc.pdf",
          resourceType: "raw",
          format: "pdf",
          bytes: 71514,
        },
        generatedAt: new Date(),
        isActive: true,
        generationTrigger: "lease_created",
      },
    ],
    document: {
      publicId: "rentsafe/agreements/test-doc",
      secureUrl: "https://res.cloudinary.com/test/test-doc.pdf",
      documentHash: "testhash123abc",
      pdfChecksum: "testchecksum456def",
      generatedAt: new Date(),
    },
    status: "Pending",
    isLocked: false,
    ...overrides,
  });

  // Keep parity with the real agreement.service.js createAgreement flow —
  // write the same AGREEMENT_CREATED audit event a real onboarding/lease
  // creation call would produce, so tests checking the audit trail behave
  // identically whether the agreement came from the factory or the real flow.
  const {
    createAuditEvent,
  } = require("../../../src/services/auditTrail.service");
  await createAuditEvent({
    agreement: agreement._id,
    agreementReference: agreement.agreementReference,
    event: "AGREEMENT_CREATED",
    actorRole: "system",
    agreementVersion: 1,
    documentHash: agreement.document.documentHash,
    metadata: { leaseId, agreementType: agreement.agreementType },
  });

  return agreement;
};

// ─── TenantInvitation factory ─────────────────────────────────────────────────
const createInvitation = async (
  tenantId,
  userAccountId,
  landlordId,
  overrides = {},
) => {
  const crypto = require("crypto");
  const bcrypt = require("bcryptjs");
  const plain = crypto.randomBytes(32).toString("hex");
  const hash = await bcrypt.hash(plain, 10);

  const invitation = await TenantInvitation.create({
    tenant: tenantId,
    userAccount: userAccountId,
    invitedBy: landlordId,
    email: overrides.email || "tenant@test.com",
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: "Pending",
    propertyName: "Test Property",
    unitNumber: "Flat A1",
    landlordName: "Test Landlord",
    ...overrides,
  });

  return { invitation, plain };
};

// ─── Full stack factory — landlord + property + unit + tenant + lease ─────────
const createFullStack = async () => {
  const landlord = await User.create({
    name: "Stack Landlord",
    email: `stacklandlord${Date.now()}@test.com`,
    phone: "08012345678",
    password: "Landlord@Test1",
    role: "landlord",
    provider: "local",
    isVerified: true,
    accountStatus: "Active",
  });

  const property = await createProperty(landlord._id);
  const unit = await createUnit(property._id, landlord._id);
  const tenant = await createTenant(landlord._id);
  const tenantUser = await createTenantUserAccount(tenant._id, landlord._id);
  const lease = await createLease(
    tenant._id,
    property._id,
    unit._id,
    landlord._id,
  );
  const agreement = await createAgreement(
    lease._id,
    landlord._id,
    tenant._id,
    unit._id,
    property._id,
  );

  const { generateToken } = require("../../../src/utils/jwt");
  const landlordToken = generateToken({ id: landlord._id, role: "landlord" });
  const tenantToken = generateToken({ id: tenantUser._id, role: "tenant" });

  return {
    landlord,
    landlordToken,
    property,
    unit,
    tenant,
    tenantUser,
    tenantToken,
    lease,
    agreement,
  };
};

module.exports = {
  createProperty,
  createUnit,
  createTenant,
  createTenantUserAccount,
  createLease,
  createActiveLease,
  createAgreement,
  createInvitation,
  createFullStack,
};
