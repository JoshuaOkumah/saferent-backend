require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const {
  getLandlordWithToken,
  createOtherLandlord,
} = require("../helpers/auth");
const {
  createProperty,
  createUnit,
  createTenant,
  createLease,
  createActiveLease,
  createAgreement,
} = require("../factories");
const Lease = require("../../../src/models/Lease");
const Unit = require("../../../src/models/Unit");
const Tenant = require("../../../src/models/Tenant");
const mongoose = require("mongoose");

setupTestDB();

describe("Lease Endpoints", () => {
  let token, landlord, property, unit, tenant;

  beforeEach(async () => {
    ({ landlord, token } = await getLandlordWithToken({
      email: "leaseland@test.com",
    }));
    property = await createProperty(landlord._id);
    unit = await createUnit(property._id, landlord._id);
    tenant = await createTenant(landlord._id, {
      email: "leasetenant@test.com",
    });
  });

  const leasePayload = () => ({
    tenantId: tenant._id.toString(),
    propertyId: property._id.toString(),
    unitId: unit._id.toString(),
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    rentAmount: 500000,
    securityDeposit: 100000,
    serviceCharge: 50000,
    paymentFrequency: "Annually",
    rentDueDay: 1,
    gracePeriod: 7,
    noticePeriod: 30,
  });

  // ── POST /api/leases ──────────────────────────────────────────────────────────

  describe("POST /api/leases", () => {
    test("201 — creates lease with PENDING status", async () => {
      const res = await api.post("/api/leases", leasePayload(), token);
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("Pending");
      expect(res.body.data.leaseNumber).toMatch(/^LS-\d{4}-\d{4}$/);
    });

    test("unit remains VACANT after lease creation", async () => {
      await api.post("/api/leases", leasePayload(), token);
      const updatedUnit = await Unit.findById(unit._id);
      expect(updatedUnit.status).toBe("Vacant");
    });

    test("lease number is auto-generated", async () => {
      const res = await api.post("/api/leases", leasePayload(), token);
      expect(res.body.data.leaseNumber).toBeTruthy();
      expect(res.body.data.leaseNumber).toMatch(/^LS-/);
    });

    test("agreement is automatically created on lease creation", async () => {
      const res = await api.post("/api/leases", leasePayload(), token);
      const leaseId = res.body.data._id;
      const agreementRes = await api.get(`/api/agreements/${leaseId}`, token);
      expect(agreementRes.status).toBe(200);
      expect(agreementRes.body.data).toBeTruthy();
    });

    test("400 — end date before start date", async () => {
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
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
        "/api/leases",
        {
          ...leasePayload(),
          rentAmount: -500,
        },
        token,
      );
      expect(res.status).toBe(400);
    });

    test("400 — unit already has active lease", async () => {
      await createActiveLease(tenant._id, property._id, unit._id, landlord._id);
      const newTenant = await createTenant(landlord._id, {
        email: "newt@test.com",
      });
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
          tenantId: newTenant._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/occupied|lease/i);
    });

    test("400 — unit already has pending lease", async () => {
      await createLease(tenant._id, property._id, unit._id, landlord._id);
      const newTenant = await createTenant(landlord._id, {
        email: "newt2@test.com",
      });
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
          tenantId: newTenant._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/lease.*progress|already/i);
    });

    test("400 — tenant already has active or pending lease", async () => {
      await createLease(tenant._id, property._id, unit._id, landlord._id);
      const unit2 = await createUnit(property._id, landlord._id, {
        unitNumber: "Flat-NEW2",
      });
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
          unitId: unit2._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already has/i);
    });

    test("400 — blacklisted tenant cannot get a lease", async () => {
      const blacklisted = await createTenant(landlord._id, {
        email: "blacklisted@test.com",
        status: "Blacklisted",
      });
      const unit2 = await createUnit(property._id, landlord._id, {
        unitNumber: "Flat-BL1",
      });
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
          tenantId: blacklisted._id.toString(),
          unitId: unit2._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/blacklisted/i);
    });

    test("400 — archived tenant cannot get a lease", async () => {
      const archived = await createTenant(landlord._id, {
        email: "archived2@test.com",
        status: "Archived",
      });
      const unit2 = await createUnit(property._id, landlord._id, {
        unitNumber: "Flat-ARC",
      });
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
          tenantId: archived._id.toString(),
          unitId: unit2._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/archived/i);
    });

    test("400 — overlapping lease dates blocked", async () => {
      await createLease(tenant._id, property._id, unit._id, landlord._id, {
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        status: "Renewed",
      });
      const newTenant = await createTenant(landlord._id, {
        email: "overlap@test.com",
      });
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
          tenantId: newTenant._id.toString(),
          startDate: "2026-06-01",
          endDate: "2027-05-31",
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/overlap/i);
    });

    test("404 — property not found / cross-landlord blocked", async () => {
      const other = await createOtherLandlord({
        email: "otherleaser@test.com",
      });
      const otherProp = await createProperty(other._id);
      const res = await api.post(
        "/api/leases",
        {
          ...leasePayload(),
          propertyId: otherProp._id.toString(),
        },
        token,
      );
      expect(res.status).toBe(404);
    });

    test("401 — no token", async () => {
      const res = await api.post("/api/leases", leasePayload());
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/leases ───────────────────────────────────────────────────────────

  describe("GET /api/leases", () => {
    beforeEach(async () => {
      const t2 = await createTenant(landlord._id, { email: "lt2@test.com" });
      const u2 = await createUnit(property._id, landlord._id, {
        unitNumber: "Flat-L2",
      });
      await createLease(tenant._id, property._id, unit._id, landlord._id, {
        status: "Active",
      });
      await createLease(t2._id, property._id, u2._id, landlord._id, {
        status: "Pending",
      });
    });

    test("200 — returns paginated leases", async () => {
      const res = await api.get("/api/leases", token);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.pagination).toBeTruthy();
    });

    test("200 — filter by status=Active", async () => {
      const res = await api.get("/api/leases?status=Active", token);
      expect(res.status).toBe(200);
      expect(res.body.data.every((l) => l.status === "Active")).toBe(true);
    });

    test("200 — filter by tenantId", async () => {
      const res = await api.get(`/api/leases?tenantId=${tenant._id}`, token);
      expect(res.status).toBe(200);
      expect(
        res.body.data.every(
          (l) => l.tenant._id.toString() === tenant._id.toString(),
        ),
      ).toBe(true);
    });

    test("landlord only sees their own leases", async () => {
      const other = await createOtherLandlord({
        email: "otherleaseget@test.com",
      });
      const otherProp = await createProperty(other._id);
      const otherUnit = await createUnit(otherProp._id, other._id);
      const otherTenant = await createTenant(other._id, {
        email: "otherlt@test.com",
      });
      await createLease(
        otherTenant._id,
        otherProp._id,
        otherUnit._id,
        other._id,
      );

      const res = await api.get("/api/leases", token);
      res.body.data.forEach((l) => {
        expect(l.landlord.toString()).toBe(landlord._id.toString());
      });
    });
  });

  // ── GET /api/leases/expiring ──────────────────────────────────────────────────

  describe("GET /api/leases/expiring", () => {
    test("200 — returns leases expiring within 30 days", async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 15);
      await createLease(tenant._id, property._id, unit._id, landlord._id, {
        status: "Active",
        endDate: soon,
      });

      const res = await api.get("/api/leases/expiring", token);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty("daysLeft");
      expect(res.body.data[0].daysLeft).toBeLessThanOrEqual(30);
    });

    test("200 — does not return leases expiring after 30 days", async () => {
      const far = new Date();
      far.setDate(far.getDate() + 60);
      await createLease(tenant._id, property._id, unit._id, landlord._id, {
        status: "Active",
        endDate: far,
      });

      const res = await api.get("/api/leases/expiring", token);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  // ── GET /api/leases/:id ───────────────────────────────────────────────────────

  describe("GET /api/leases/:id", () => {
    test("200 — returns populated lease detail", async () => {
      const lease = await createLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.get(`/api/leases/${lease._id}`, token);
      expect(res.status).toBe(200);
      expect(res.body.data._id.toString()).toBe(lease._id.toString());
      expect(res.body.data.tenant).toHaveProperty("firstName");
      expect(res.body.data.property).toHaveProperty("name");
    });

    test("404 — cross-landlord access blocked", async () => {
      const other = await createOtherLandlord({ email: "crosslease@test.com" });
      const op = await createProperty(other._id);
      const ou = await createUnit(op._id, other._id);
      const ot = await createTenant(other._id, { email: "crosslt@test.com" });
      const lease = await createLease(ot._id, op._id, ou._id, other._id);
      const res = await api.get(`/api/leases/${lease._id}`, token);
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/leases/:id/terminate ──────────────────────────────────────────

  describe("PATCH /api/leases/:id/terminate", () => {
    test("200 — terminates active lease, frees unit, marks tenant Former", async () => {
      const lease = await createActiveLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.patch(
        `/api/leases/${lease._id}/terminate`,
        { reason: "Tenant relocated" },
        token,
      );
      expect(res.status).toBe(200);

      const [updatedLease, updatedUnit, updatedTenant] = await Promise.all([
        Lease.findById(lease._id),
        Unit.findById(unit._id),
        Tenant.findById(tenant._id),
      ]);
      expect(updatedLease.status).toBe("Terminated");
      expect(updatedUnit.status).toBe("Vacant");
      expect(updatedUnit.tenant).toBeNull();
      expect(updatedTenant.status).toBe("Former");
    });

    test("200 — terminates pending lease, unit stays vacant", async () => {
      const lease = await createLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.patch(
        `/api/leases/${lease._id}/terminate`,
        {},
        token,
      );
      expect(res.status).toBe(200);
      const updatedUnit = await Unit.findById(unit._id);
      expect(updatedUnit.status).toBe("Vacant");
    });

    test("400 — cannot terminate already terminated lease", async () => {
      const lease = await createLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
        {
          status: "Terminated",
        },
      );
      const res = await api.patch(
        `/api/leases/${lease._id}/terminate`,
        {},
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot terminate/i);
    });

    test("400 — cannot terminate expired lease", async () => {
      const lease = await createLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
        {
          status: "Expired",
        },
      );
      const res = await api.patch(
        `/api/leases/${lease._id}/terminate`,
        {},
        token,
      );
      expect(res.status).toBe(400);
    });

    test("404 — cross-landlord access blocked", async () => {
      const other = await createOtherLandlord({ email: "crossterm@test.com" });
      const op = await createProperty(other._id);
      const ou = await createUnit(op._id, other._id);
      const ot = await createTenant(other._id, {
        email: "crossterm_t@test.com",
      });
      const lease = await createLease(ot._id, op._id, ou._id, other._id, {
        status: "Active",
      });
      const res = await api.patch(
        `/api/leases/${lease._id}/terminate`,
        {},
        token,
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/leases/:id/renew ────────────────────────────────────────────────

  describe("POST /api/leases/:id/renew", () => {
    test("201 — renews active lease with new dates", async () => {
      const lease = await createActiveLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.post(
        `/api/leases/${lease._id}/renew`,
        {
          startDate: "2027-07-01",
          endDate: "2028-06-30",
          rentAmount: 550000,
        },
        token,
      );
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("Active");
      expect(res.body.data.leaseNumber).not.toBe(lease.leaseNumber);
    });

    test("old lease marked as Renewed after renewal", async () => {
      const lease = await createActiveLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      await api.post(
        `/api/leases/${lease._id}/renew`,
        {
          startDate: "2027-07-01",
          endDate: "2028-06-30",
          rentAmount: 550000,
        },
        token,
      );
      const updatedOld = await Lease.findById(lease._id);
      expect(updatedOld.status).toBe("Renewed");
      expect(updatedOld.renewedTo).toBeTruthy();
    });

    test("new lease has renewedFrom pointing to old lease", async () => {
      const lease = await createActiveLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.post(
        `/api/leases/${lease._id}/renew`,
        {
          startDate: "2027-07-01",
          endDate: "2028-06-30",
          rentAmount: 550000,
        },
        token,
      );
      const newLease = await Lease.findById(res.body.data._id);
      expect(newLease.renewedFrom.toString()).toBe(lease._id.toString());
    });

    test("400 — cannot renew terminated lease", async () => {
      const lease = await createLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
        {
          status: "Terminated",
        },
      );
      const res = await api.post(
        `/api/leases/${lease._id}/renew`,
        {
          startDate: "2027-07-01",
          endDate: "2028-06-30",
          rentAmount: 550000,
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/only active/i);
    });

    test("400 — end date before start date", async () => {
      const lease = await createActiveLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.post(
        `/api/leases/${lease._id}/renew`,
        {
          startDate: "2028-01-01",
          endDate: "2027-01-01",
          rentAmount: 550000,
        },
        token,
      );
      expect(res.status).toBe(400);
    });

    test("400 — missing required fields", async () => {
      const lease = await createActiveLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.post(
        `/api/leases/${lease._id}/renew`,
        {
          startDate: "2027-07-01",
        },
        token,
      );
      expect(res.status).toBe(400);
    });
  });

  // ── PATCH /api/leases/:id/cancel ──────────────────────────────────────────────

  describe("PATCH /api/leases/:id/cancel", () => {
    test("200 — cancels pending lease", async () => {
      const lease = await createLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.patch(`/api/leases/${lease._id}/cancel`, {}, token);
      expect(res.status).toBe(200);
      const updated = await Lease.findById(lease._id);
      expect(updated.status).toBe("Cancelled");
    });

    test("400 — cannot cancel active lease — use terminate", async () => {
      const lease = await createActiveLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      const res = await api.patch(`/api/leases/${lease._id}/cancel`, {}, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/terminate/i);
    });

    test("unit stays vacant after pending lease is cancelled", async () => {
      const lease = await createLease(
        tenant._id,
        property._id,
        unit._id,
        landlord._id,
      );
      await api.patch(`/api/leases/${lease._id}/cancel`, {}, token);
      const updatedUnit = await Unit.findById(unit._id);
      expect(updatedUnit.status).toBe("Vacant");
    });
  });
});
