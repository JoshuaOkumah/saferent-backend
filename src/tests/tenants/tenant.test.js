require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const {
  getLandlordWithToken,
  createOtherLandlord,
  getTokenForUser,
} = require("../helpers/auth");
const {
  createProperty,
  createUnit,
  createTenant,
  createTenantUserAccount,
  createInvitation,
  createActiveLease,
} = require("../factories");
const Tenant = require("../../../src/models/Tenant");
const Unit = require("../../../src/models/Unit");
const User = require("../../../src/models/User");
const Lease = require("../../../src/models/Lease");
const mongoose = require("mongoose");

setupTestDB();

describe("Tenant Endpoints", () => {
  let token, landlord, property, unit;

  beforeEach(async () => {
    ({ landlord, token } = await getLandlordWithToken({
      email: "tenantlandlord@test.com",
    }));
    property = await createProperty(landlord._id);
    unit = await createUnit(property._id, landlord._id);
  });

  const validOnboardPayload = () => ({
    firstName: "John",
    lastName: "Doe",
    email: `johndoe${Date.now()}@test.com`,
    phone: "08099887766",
    propertyId: property._id.toString(),
    unitId: unit._id.toString(),
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    rentAmount: 500000,
    securityDeposit: 100000,
    serviceCharge: 50000,
    paymentFrequency: "Annually",
  });

  // ── POST /api/tenants/onboard ────────────────────────────────────────────────

  describe("POST /api/tenants/onboard", () => {
    test("201 — creates tenant, lease, agreement, sends invite", async () => {
      const payload = validOnboardPayload();
      const res = await api.post("/api/tenants/onboard", payload, token);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenant.firstName).toBe("John");
      expect(res.body.data.lease.status).toBe("Pending");
      expect(res.body.data.invitation.status).toBe("Pending");
    });

    test("lease status is PENDING — not Active", async () => {
      const payload = validOnboardPayload();
      const res = await api.post("/api/tenants/onboard", payload, token);
      expect(res.body.data.lease.status).toBe("Pending");
    });

    test("unit remains VACANT after onboarding", async () => {
      const payload = validOnboardPayload();
      await api.post("/api/tenants/onboard", payload, token);
      const updatedUnit = await Unit.findById(unit._id);
      expect(updatedUnit.status).toBe("Vacant");
    });

    test("tenant status is Pending Activation after onboarding", async () => {
      const payload = validOnboardPayload();
      const res = await api.post("/api/tenants/onboard", payload, token);
      const tenant = await Tenant.findById(res.body.data.tenant._id);
      expect(tenant.status).toBe("Pending Activation");
    });

    test("User account created with Pending Activation status", async () => {
      const payload = validOnboardPayload();
      await api.post("/api/tenants/onboard", payload, token);
      const user = await User.findOne({ email: payload.email });
      expect(user).toBeTruthy();
      expect(user.accountStatus).toBe("Pending Activation");
      expect(user.isVerified).toBe(false);
      expect(user.role).toBe("tenant");
    });

    test("400 — missing firstName", async () => {
      const { firstName, ...payload } = validOnboardPayload();
      const res = await api.post("/api/tenants/onboard", payload, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/first name/i);
    });

    test("400 — missing email", async () => {
      const { email, ...payload } = validOnboardPayload();
      const res = await api.post("/api/tenants/onboard", payload, token);
      expect(res.status).toBe(400);
    });

    test("400 — end date before start date", async () => {
      const res = await api.post(
        "/api/tenants/onboard",
        {
          ...validOnboardPayload(),
          startDate: "2027-01-01",
          endDate: "2026-01-01",
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/end date must be after/i);
    });

    test("400 — negative rent amount", async () => {
      const res = await api.post(
        "/api/tenants/onboard",
        {
          ...validOnboardPayload(),
          rentAmount: -500,
        },
        token,
      );
      expect(res.status).toBe(400);
    });

    test("409 — duplicate email for same landlord", async () => {
      const payload = validOnboardPayload();
      await api.post("/api/tenants/onboard", payload, token);

      const newUnit = await createUnit(property._id, landlord._id, {
        unitNumber: "Flat-B99",
      });
      const res = await api.post(
        "/api/tenants/onboard",
        {
          ...validOnboardPayload(),
          email: payload.email,
          unitId: newUnit._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already exists|already associated/i);
    });

    test("400 — unit already has pending lease", async () => {
      const payload = validOnboardPayload();
      await api.post("/api/tenants/onboard", payload, token);

      // Try onboarding another tenant to same unit
      const res = await api.post(
        "/api/tenants/onboard",
        {
          ...validOnboardPayload(),
          email: `newperson${Date.now()}@test.com`,
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/lease in progress/i);
    });

    test("400 — unit under maintenance cannot be leased", async () => {
      const maintenanceUnit = await createUnit(property._id, landlord._id, {
        unitNumber: "Maintenance-U1",
        status: "Under Maintenance",
      });
      const res = await api.post(
        "/api/tenants/onboard",
        {
          ...validOnboardPayload(),
          unitId: maintenanceUnit._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/maintenance/i);
    });

    test("404 — property not found / cross-landlord access blocked", async () => {
      const other = await createOtherLandlord({
        email: "othertenant@test.com",
      });
      const otherProp = await createProperty(other._id);
      const res = await api.post(
        "/api/tenants/onboard",
        {
          ...validOnboardPayload(),
          propertyId: otherProp._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(404);
    });

    test("401 — no token", async () => {
      const res = await api.post("/api/tenants/onboard", validOnboardPayload());
      expect(res.status).toBe(401);
    });
  });

  // ── POST /api/tenants/activate ────────────────────────────────────────────────

  describe("POST /api/tenants/activate", () => {
    let tenantDoc, tenantUserAccount, activationToken;

    beforeEach(async () => {
      tenantDoc = await createTenant(landlord._id, {
        email: "activate@test.com",
        status: "Pending Activation",
      });
      tenantUserAccount = await createTenantUserAccount(
        tenantDoc._id,
        landlord._id,
        {
          email: "activate@test.com",
          isVerified: false,
          accountStatus: "Pending Activation",
        },
      );
      const { invitation, plain } = await createInvitation(
        tenantDoc._id,
        tenantUserAccount._id,
        landlord._id,
        { email: "activate@test.com" },
      );
      activationToken = plain;
    });

    test("200 — activates account with valid token", async () => {
      const res = await api.post("/api/tenants/activate", {
        token: activationToken,
        email: "activate@test.com",
        password: "Tenant@Test1",
        confirmPassword: "Tenant@Test1",
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.role).toBe("tenant");
    });

    test("User is marked verified after activation", async () => {
      await api.post("/api/tenants/activate", {
        token: activationToken,
        email: "activate@test.com",
        password: "Tenant@Test1",
        confirmPassword: "Tenant@Test1",
      });
      const user = await User.findById(tenantUserAccount._id);
      expect(user.isVerified).toBe(true);
      expect(user.accountStatus).toBe("Active");
    });

    test("400 — wrong token", async () => {
      const res = await api.post("/api/tenants/activate", {
        token: "wrongtoken".repeat(6),
        email: "activate@test.com",
        password: "Tenant@Test1",
        confirmPassword: "Tenant@Test1",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid/i);
    });

    test("400 — passwords do not match", async () => {
      const res = await api.post("/api/tenants/activate", {
        token: activationToken,
        email: "activate@test.com",
        password: "Tenant@Test1",
        confirmPassword: "Different@Pass1",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/do not match/i);
    });

    test("400 — weak password rejected", async () => {
      const res = await api.post("/api/tenants/activate", {
        token: activationToken,
        email: "activate@test.com",
        password: "weakpass",
        confirmPassword: "weakpass",
      });
      expect(res.status).toBe(400);
    });

    test("400 — expired invitation", async () => {
      const {
        TenantInvitation,
      } = require("../../../src/models/TenantInvitation");
      await require("../../../src/models/TenantInvitation").updateMany(
        { userAccount: tenantUserAccount._id },
        { expiresAt: new Date(Date.now() - 1000) },
      );
      const res = await api.post("/api/tenants/activate", {
        token: activationToken,
        email: "activate@test.com",
        password: "Tenant@Test1",
        confirmPassword: "Tenant@Test1",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expired/i);
    });
  });

  // ── GET /api/tenants ──────────────────────────────────────────────────────────

  describe("GET /api/tenants", () => {
    beforeEach(async () => {
      await createTenant(landlord._id, {
        email: "tenant1@test.com",
        firstName: "Alice",
      });
      await createTenant(landlord._id, {
        email: "tenant2@test.com",
        firstName: "Bob",
        status: "Active",
      });
    });

    test("200 — returns landlord's tenants only", async () => {
      const other = await createOtherLandlord({
        email: "othertenantland@test.com",
      });
      await createTenant(other._id, { email: "othertenant@test.com" });

      const res = await api.get("/api/tenants", token);
      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (t) => t.owner.toString() === landlord._id.toString(),
        ),
      ).toBe(true);
    });

    test("200 — filter by status", async () => {
      const res = await api.get("/api/tenants?status=Active", token);
      expect(res.status).toBe(200);
      expect(res.body.data.every((t) => t.status === "Active")).toBe(true);
    });

    test("200 — search by name", async () => {
      const res = await api.get("/api/tenants?search=Alice", token);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].firstName).toBe("Alice");
    });

    test("200 — pagination", async () => {
      const res = await api.get("/api/tenants?page=1&limit=1", token);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.total).toBe(2);
    });

    test("400 — invalid status filter", async () => {
      const res = await api.get("/api/tenants?status=Ghost", token);
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/tenants/:id ──────────────────────────────────────────────────────

  describe("GET /api/tenants/:id", () => {
    test("200 — returns full tenant profile with lease history", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "fullprofile@test.com",
      });
      const res = await api.get(`/api/tenants/${tenant._id}`, token);
      expect(res.status).toBe(200);
      expect(res.body.data._id.toString()).toBe(tenant._id.toString());
      expect(res.body.data).toHaveProperty("leaseHistory");
    });

    test("404 — cross-landlord access blocked", async () => {
      const other = await createOtherLandlord({ email: "crossland@test.com" });
      const otherTenant = await createTenant(other._id, {
        email: "crosstenantget@test.com",
      });
      const res = await api.get(`/api/tenants/${otherTenant._id}`, token);
      expect(res.status).toBe(404);
    });

    test("internalNotes NOT exposed to tenant", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "secretnotes@test.com",
        internalNotes: "Paid late twice",
      });
      const tenantUserAcc = await createTenantUserAccount(
        tenant._id,
        landlord._id,
        {
          email: "secretnotes@test.com",
        },
      );
      const tToken = getTokenForUser(tenantUserAcc);

      const res = await api.get(`/api/tenants/me/profile`, tToken);
      expect(res.status).toBe(200);
      expect(res.body.data.profile.internalNotes).toBeUndefined();
    });
  });

  // ── PUT /api/tenants/:id ──────────────────────────────────────────────────────

  describe("PUT /api/tenants/:id", () => {
    test("200 — landlord can update permitted fields", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "update1@test.com",
      });
      const res = await api.put(
        `/api/tenants/${tenant._id}`,
        {
          occupation: "Engineer",
          notes: "Reliable tenant",
          internalNotes: "Watch payment timing",
        },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.occupation).toBe("Engineer");
      expect(res.body.data.notes).toBe("Reliable tenant");
    });

    test("200 — gender is silently ignored by landlord (tenant-only field)", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "gendertest@test.com",
        gender: "Male",
      });
      await api.put(`/api/tenants/${tenant._id}`, { gender: "Female" }, token);
      const updated = await Tenant.findById(tenant._id);
      expect(updated.gender).toBe("Male");
    });

    test("200 — landlord can blacklist a tenant", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "blacklist@test.com",
      });
      const res = await api.put(
        `/api/tenants/${tenant._id}`,
        { status: "Blacklisted" },
        token,
      );
      expect(res.status).toBe(200);
      const updated = await Tenant.findById(tenant._id);
      expect(updated.status).toBe("Blacklisted");
    });

    test("400 — cannot update archived tenant", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "archived@test.com",
        status: "Archived",
      });
      const res = await api.put(
        `/api/tenants/${tenant._id}`,
        { occupation: "Doctor" },
        token,
      );
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/tenants/:id ───────────────────────────────────────────────────

  describe("DELETE /api/tenants/:id", () => {
    test("200 — archives tenant with no active lease", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "archive@test.com",
        status: "Former",
      });
      const res = await api.delete(`/api/tenants/${tenant._id}`, token);
      expect(res.status).toBe(200);
      const updated = await Tenant.findById(tenant._id);
      expect(updated.status).toBe("Archived");
    });

    test("400 — cannot archive tenant with active lease", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "activelease@test.com",
      });
      await createActiveLease(tenant._id, property._id, unit._id, landlord._id);
      const res = await api.delete(`/api/tenants/${tenant._id}`, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/active lease/i);
    });

    test("400 — cannot archive already archived tenant", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "alreadyarchived@test.com",
        status: "Archived",
      });
      const res = await api.delete(`/api/tenants/${tenant._id}`, token);
      expect(res.status).toBe(400);
    });

    test("tenant record is never hard deleted", async () => {
      const tenant = await createTenant(landlord._id, {
        email: "nodelete@test.com",
        status: "Former",
      });
      await api.delete(`/api/tenants/${tenant._id}`, token);
      const found = await Tenant.findById(tenant._id);
      expect(found).toBeTruthy();
    });
  });

  // ── Tenant self-update ────────────────────────────────────────────────────────

  describe("PATCH /api/tenants/me/profile", () => {
    let tToken, tenantDoc;

    beforeEach(async () => {
      tenantDoc = await createTenant(landlord._id, { email: "self@test.com" });
      const tenantUser = await createTenantUserAccount(
        tenantDoc._id,
        landlord._id,
        {
          email: "self@test.com",
        },
      );
      tToken = getTokenForUser(tenantUser);
    });

    test("200 — tenant updates their own personal info", async () => {
      const res = await api.patch(
        "/api/tenants/me/profile",
        {
          phone: "08099001122",
          occupation: "Software Engineer",
          nationality: "Nigerian",
        },
        tToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.phone).toBe("08099001122");
    });

    test("400 — tenant cannot edit notes", async () => {
      const res = await api.patch(
        "/api/tenants/me/profile",
        { notes: "I am great" },
        tToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not allowed/i);
    });

    test("400 — tenant cannot edit internalNotes", async () => {
      const res = await api.patch(
        "/api/tenants/me/profile",
        { internalNotes: "Clear my record" },
        tToken,
      );
      expect(res.status).toBe(400);
    });

    test("400 — tenant cannot change their own status", async () => {
      const res = await api.patch(
        "/api/tenants/me/profile",
        { status: "Active" },
        tToken,
      );
      expect(res.status).toBe(400);
    });

    test("403 — landlord cannot access tenant self-profile route", async () => {
      const res = await api.patch(
        "/api/tenants/me/profile",
        { phone: "08099001122" },
        token,
      );
      expect(res.status).toBe(403);
    });
  });
});
