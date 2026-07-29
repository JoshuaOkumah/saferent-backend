require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const Lease = require("../../../src/models/Lease");
const Unit = require("../../../src/models/Unit");
const Tenant = require("../../../src/models/Tenant");
const RentalAgreement = require("../../../src/models/RentalAgreement");
const User = require("../../../src/models/User");
const TenantInvitation = require("../../../src/models/TenantInvitation");
const { generateToken } = require("../../../src/utils/jwt");

setupTestDB();

describe("Integration: Complete RentSafe Lifecycle", () => {
  test("full lifecycle from registration to termination", async () => {
    let landlordToken, landlord;
    let property, unit;
    let tenantRecord, tenantUserAccount, tenantToken;
    let lease, agreement;

    // Step 1 — register
    const registerRes = await api.post("/api/auth/register", {
      name: "Integration Landlord",
      email: "intlandlord@test.com",
      phone: "08012345678",
      password: "Landlord@Int1",
    });
    expect(registerRes.status).toBe(201);

    // Step 2 — verify email
    const user = await User.findOne({ email: "intlandlord@test.com" }).select(
      "+emailVerificationOtpHash",
    );
    expect(user).toBeTruthy();

    const bcrypt = require("bcryptjs");
    const otp = "111222";
    user.emailVerificationOtpHash = await bcrypt.hash(otp, 10);
    user.emailVerificationExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const verifyRes = await api.post("/api/auth/verify-email", {
      email: "intlandlord@test.com",
      otp,
    });
    expect(verifyRes.status).toBe(200);
    landlordToken = verifyRes.body.token;
    landlord = verifyRes.body.user;

    // Step 3 — create property
    const propRes = await api.post(
      "/api/properties",
      {
        name: "Integration Estate",
        propertyType: "Block of Flats",
        address: "No 1 Integration Road",
        city: "Owerri",
        state: "Imo",
      },
      landlordToken,
    );
    expect(propRes.status).toBe(201);
    property = propRes.body.data;

    // Step 4 — create unit
    const unitRes = await api.post(
      `/api/properties/${property._id}/units`,
      {
        unitNumber: "Int-Flat-A1",
        unitType: "2 Bedroom",
        rentAmount: 500000,
        serviceCharge: 50000,
        securityDeposit: 100000,
      },
      landlordToken,
    );
    expect(unitRes.status).toBe(201);
    unit = unitRes.body.data;
    expect(unit.status).toBe("Vacant");

    // Step 5 — onboard tenant
    const onboardRes = await api.post(
      "/api/tenants/onboard",
      {
        firstName: "Integration",
        lastName: "Tenant",
        email: "inttenant@test.com",
        phone: "08099887766",
        propertyId: property._id,
        unitId: unit._id,
        startDate: "2026-07-01",
        endDate: "2027-06-30",
        rentAmount: 500000,
        securityDeposit: 100000,
        serviceCharge: 50000,
        paymentFrequency: "Annually",
      },
      landlordToken,
    );
    expect(onboardRes.status).toBe(201);
    expect(onboardRes.body.data.lease.status).toBe("Pending");
    expect(onboardRes.body.data.invitation.status).toBe("Pending");
    tenantRecord = onboardRes.body.data.tenant;

    // Step 6 — unit still vacant
    const unitAfterOnboard = await Unit.findById(unit._id);
    expect(unitAfterOnboard.status).toBe("Vacant");

    // Step 7 — tenant activates
    const invitation = await TenantInvitation.findOne({
      email: "inttenant@test.com",
      status: "Pending",
    }).select("+tokenHash");
    expect(invitation).toBeTruthy();

    const crypto = require("crypto");
    const plain = crypto.randomBytes(32).toString("hex");
    invitation.tokenHash = await bcrypt.hash(plain, 10);
    await invitation.save();

    const activateRes = await api.post("/api/tenants/activate", {
      token: plain,
      email: "inttenant@test.com",
      password: "Tenant@Int1",
      confirmPassword: "Tenant@Int1",
    });
    expect(activateRes.status).toBe(200);
    tenantToken = activateRes.body.token;
    tenantUserAccount = activateRes.body.user;

    // Step 8 — tenant logs in
    const loginRes = await api.post("/api/auth/login", {
      email: "inttenant@test.com",
      password: "Tenant@Int1",
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe("tenant");

    // Step 9 — agreement auto-generated
    const leaseDoc = await Lease.findOne({ tenant: tenantRecord._id });
    expect(leaseDoc).toBeTruthy();
    lease = leaseDoc;

    const agreementRes = await api.get(
      `/api/agreements/${lease._id}`,
      landlordToken,
    );
    expect(agreementRes.status).toBe(200);
    expect(agreementRes.body.data.agreementReference).toMatch(/^RS-AGR-/);
    expect(agreementRes.body.data.document.secureUrl).toBeTruthy();

    // Step 10 — tenant views agreement
    const tenantViewRes = await api.get(
      `/api/agreements/${lease._id}`,
      tenantToken,
    );
    expect(tenantViewRes.status).toBe(200);

    // Step 11 — tenant signs
    const tenantSignRes = await api.patch(
      `/api/agreements/${lease._id}/tenant-sign`,
      { nonce: "int-nonce-tenant" },
      tenantToken,
    );
    expect(tenantSignRes.status).toBe(200);
    expect(tenantSignRes.body.data.leaseActivated).toBe(false);
    expect(tenantSignRes.body.data.signatureId).toMatch(/^RSD-T-/);

    const statusRes = await api.get(
      `/api/agreements/${lease._id}/status`,
      landlordToken,
    );
    expect(statusRes.body.data.tenantSigned).toBe(true);
    expect(statusRes.body.data.landlordSigned).toBe(false);

    // Step 12 — unit still vacant
    const unitStillVacant = await Unit.findById(unit._id);
    expect(unitStillVacant.status).toBe("Vacant");
    const leaseStillPending = await Lease.findById(lease._id);
    expect(leaseStillPending.status).toBe("Pending");

    // Step 13 — landlord signs → activates everything
    const landlordSignRes = await api.patch(
      `/api/agreements/${lease._id}/landlord-sign`,
      { nonce: "int-nonce-landlord" },
      landlordToken,
    );
    expect(landlordSignRes.status).toBe(200);
    expect(landlordSignRes.body.data.leaseActivated).toBe(true);

    // Step 14 — verify activation
    const [activeLease, occupiedUnit, activeTenant] = await Promise.all([
      Lease.findById(lease._id),
      Unit.findById(unit._id),
      Tenant.findById(tenantRecord._id),
    ]);
    expect(activeLease.status).toBe("Active");
    expect(occupiedUnit.status).toBe("Occupied");
    expect(occupiedUnit.tenant.toString()).toBe(tenantRecord._id.toString());
    expect(activeTenant.status).toBe("Active");

    // Step 15 — agreement locked
    const lockedAgreement = await RentalAgreement.findOne({ lease: lease._id });
    expect(lockedAgreement.isLocked).toBe(true);
    expect(lockedAgreement.status).toBe("Completed");
    expect(lockedAgreement.lockedAt).toBeTruthy();

    // Step 16 — cannot sign again
    const lateLandlordRes = await api.patch(
      `/api/agreements/${lease._id}/landlord-sign`,
      { nonce: "late-nonce-l" },
      landlordToken,
    );
    expect(lateLandlordRes.status).toBe(400);

    const lateTenantRes = await api.patch(
      `/api/agreements/${lease._id}/tenant-sign`,
      { nonce: "late-nonce-t" },
      tenantToken,
    );
    expect(lateTenantRes.status).toBe(400);

    // Step 17 — evidence package
    const evidenceRes = await api.get(
      `/api/agreements/${lease._id}/evidence`,
      landlordToken,
    );
    expect(evidenceRes.status).toBe(200);
    expect(evidenceRes.body.data.tenantSignature.signatureId).toMatch(
      /^RSD-T-/,
    );
    expect(evidenceRes.body.data.landlordSignature.signatureId).toMatch(
      /^RSD-L-/,
    );
    expect(evidenceRes.body.data.tenantSignature.documentHash).toBe(
      evidenceRes.body.data.landlordSignature.documentHash,
    );

    // Step 18 — tenant dashboard
    const dashboardRes = await api.get("/api/tenants/me", tenantToken);
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.body.data.activeLease).toBeTruthy();
    expect(dashboardRes.body.data.activeLease.status).toBe("Active");

    // Step 19 — property stats
    const propStatsRes = await api.get(
      `/api/properties/${property._id}`,
      landlordToken,
    );
    expect(propStatsRes.status).toBe(200);
    expect(propStatsRes.body.data.stats.occupied).toBe(1);
    expect(propStatsRes.body.data.stats.occupancyRate).toBe(100);

    // Step 20 — terminate lease
    const terminateRes = await api.patch(
      `/api/leases/${lease._id}/terminate`,
      {
        reason: "End of tenancy",
      },
      landlordToken,
    );
    expect(terminateRes.status).toBe(200);

    const [terminatedLease, vacatedUnit, formerTenant] = await Promise.all([
      Lease.findById(lease._id),
      Unit.findById(unit._id),
      Tenant.findById(tenantRecord._id),
    ]);
    expect(terminatedLease.status).toBe("Terminated");
    expect(vacatedUnit.status).toBe("Vacant");
    expect(vacatedUnit.tenant).toBeNull();
    expect(formerTenant.status).toBe("Former");

    // Step 21 — history preserved
    const preservedTenant = await Tenant.findById(tenantRecord._id);
    expect(preservedTenant).toBeTruthy();
    const leaseHistory = await Lease.find({ tenant: tenantRecord._id });
    expect(leaseHistory.length).toBe(1);
    expect(leaseHistory[0].status).toBe("Terminated");
  });
});

// ── Cross-landlord isolation ──────────────────────────────────────────────────

describe("Integration: Cross-landlord isolation", () => {
  test("landlord A cannot access landlord B resources", async () => {
    const landA = await User.create({
      name: "Land A",
      email: "isola@test.com",
      phone: "080111",
      password: "Landlord@Test1",
      role: "landlord",
      isVerified: true,
      accountStatus: "Active",
    });
    const landB = await User.create({
      name: "Land B",
      email: "isolb@test.com",
      phone: "080222",
      password: "Landlord@Test1",
      role: "landlord",
      isVerified: true,
      accountStatus: "Active",
    });

    const tokenA = generateToken({ id: landA._id, role: "landlord" });

    const { createProperty, createUnit } = require("../factories");
    const propB = await createProperty(landB._id);
    await createUnit(propB._id, landB._id);

    const propRes = await api.get(`/api/properties/${propB._id}`, tokenA);
    expect(propRes.status).toBe(404);

    const unitRes = await api.get(`/api/properties/${propB._id}/units`, tokenA);
    expect(unitRes.status).toBe(404);
  });
});

// ── Transaction rollback ──────────────────────────────────────────────────────

describe("Integration: Transaction safety", () => {
  test("agreement cannot be left partially activated", async () => {
    const { createFullStack } = require("../factories");
    const stack = await createFullStack();

    await api.patch(
      `/api/agreements/${stack.lease._id}/tenant-sign`,
      { nonce: "tx-t" },
      stack.tenantToken,
    );
    await api.patch(
      `/api/agreements/${stack.lease._id}/landlord-sign`,
      { nonce: "tx-l" },
      stack.landlordToken,
    );

    const [lease, unit, tenant, agreement] = await Promise.all([
      Lease.findById(stack.lease._id),
      Unit.findById(stack.unit._id),
      Tenant.findById(stack.tenant._id),
      RentalAgreement.findOne({ lease: stack.lease._id }),
    ]);

    expect(lease.status).toBe("Active");
    expect(unit.status).toBe("Occupied");
    expect(tenant.status).toBe("Active");
    expect(agreement.isLocked).toBe(true);
  });
});
