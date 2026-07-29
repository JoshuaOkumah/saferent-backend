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
  createActiveLease,
  createLease,
} = require("../factories");
const Unit = require("../../src/models/Unit");
const mongoose = require("mongoose");

setupTestDB();

describe("Unit Endpoints", () => {
  let token, landlord, property;

  beforeEach(async () => {
    ({ landlord, token } = await getLandlordWithToken({
      email: "unitlandlord@test.com",
    }));
    property = await createProperty(landlord._id);
  });

  const validUnit = {
    unitNumber: "Flat A1",
    unitType: "2 Bedroom",
    rentAmount: 500000,
    serviceCharge: 50000,
    securityDeposit: 100000,
  };

  // ── POST /api/properties/:propertyId/units ────────────────────────────────

  describe("POST /api/properties/:propertyId/units", () => {
    test("201 — creates unit under property", async () => {
      const res = await api.post(
        `/api/properties/${property._id}/units`,
        validUnit,
        token,
      );
      expect(res.status).toBe(201);
      expect(res.body.data.unitNumber).toBe("Flat A1");
      expect(res.body.data.status).toBe("Vacant");
      expect(res.body.data.property.toString()).toBe(property._id.toString());
    });

    test("201 — unit defaults to Vacant status", async () => {
      const res = await api.post(
        `/api/properties/${property._id}/units`,
        validUnit,
        token,
      );
      expect(res.body.data.status).toBe("Vacant");
    });

    test("409 — duplicate unit number in same property", async () => {
      await api.post(`/api/properties/${property._id}/units`, validUnit, token);
      const res = await api.post(
        `/api/properties/${property._id}/units`,
        validUnit,
        token,
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already exists/i);
    });

    test("400 — missing unit number", async () => {
      const { unitNumber, ...payload } = validUnit;
      const res = await api.post(
        `/api/properties/${property._id}/units`,
        payload,
        token,
      );
      expect(res.status).toBe(400);
    });

    test("400 — negative rent amount", async () => {
      const res = await api.post(
        `/api/properties/${property._id}/units`,
        {
          ...validUnit,
          rentAmount: -5000,
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/negative/i);
    });

    test("400 — invalid unit type", async () => {
      const res = await api.post(
        `/api/properties/${property._id}/units`,
        {
          ...validUnit,
          unitType: "InvalidType",
        },
        token,
      );
      expect(res.status).toBe(400);
    });

    test("404 — property not found", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await api.post(
        `/api/properties/${fakeId}/units`,
        validUnit,
        token,
      );
      expect(res.status).toBe(404);
    });

    test("404 — cannot add unit to another landlord's property", async () => {
      const other = await createOtherLandlord({ email: "otherunit@test.com" });
      const otherProp = await createProperty(other._id);
      const res = await api.post(
        `/api/properties/${otherProp._id}/units`,
        validUnit,
        token,
      );
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/properties/:propertyId/units/bulk ───────────────────────────

  describe("POST /api/properties/:propertyId/units/bulk", () => {
    test("201 — creates multiple units at once", async () => {
      const units = [
        { unitNumber: "Flat 1", unitType: "1 Bedroom", rentAmount: 300000 },
        { unitNumber: "Flat 2", unitType: "2 Bedroom", rentAmount: 500000 },
        { unitNumber: "Flat 3", unitType: "Self Contain", rentAmount: 150000 },
      ];
      const res = await api.post(
        `/api/properties/${property._id}/units/bulk`,
        { units },
        token,
      );
      expect(res.status).toBe(201);
      expect(res.body.data.length).toBe(3);
      expect(res.body.message).toMatch(/3 units/i);
    });

    test("409 — duplicate unit number within the bulk request", async () => {
      const units = [
        { unitNumber: "Flat 1", unitType: "1 Bedroom", rentAmount: 300000 },
        { unitNumber: "Flat 1", unitType: "2 Bedroom", rentAmount: 500000 },
      ];
      const res = await api.post(
        `/api/properties/${property._id}/units/bulk`,
        { units },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/duplicate/i);
    });

    test("409 — unit number already exists in property", async () => {
      await createUnit(property._id, landlord._id, { unitNumber: "Flat X" });
      const units = [
        { unitNumber: "Flat X", unitType: "1 Bedroom", rentAmount: 300000 },
      ];
      const res = await api.post(
        `/api/properties/${property._id}/units/bulk`,
        { units },
        token,
      );
      expect(res.status).toBe(409);
    });

    test("400 — empty units array", async () => {
      const res = await api.post(
        `/api/properties/${property._id}/units/bulk`,
        { units: [] },
        token,
      );
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/properties/:propertyId/units ─────────────────────────────────

  describe("GET /api/properties/:propertyId/units", () => {
    beforeEach(async () => {
      await createUnit(property._id, landlord._id, {
        unitNumber: "Flat A",
        status: "Vacant",
      });
      await createUnit(property._id, landlord._id, {
        unitNumber: "Flat B",
        status: "Occupied",
      });
    });

    test("200 — returns all units for property", async () => {
      const res = await api.get(`/api/properties/${property._id}/units`, token);
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });

    test("200 — filter by status", async () => {
      const res = await api.get(
        `/api/properties/${property._id}/units?status=Vacant`,
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.every((u) => u.status === "Vacant")).toBe(true);
    });

    test("does not return archived units", async () => {
      await createUnit(property._id, landlord._id, {
        unitNumber: "Flat C",
        isArchived: true,
      });
      const res = await api.get(`/api/properties/${property._id}/units`, token);
      expect(res.body.count).toBe(2);
    });
  });

  // ── PATCH /api/units/:id/status ───────────────────────────────────────────

  describe("PATCH /api/units/:id/status", () => {
    test("200 — manually set unit to Reserved", async () => {
      const unit = await createUnit(property._id, landlord._id);
      const res = await api.patch(
        `/api/units/${unit._id}/status`,
        { status: "Reserved" },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("Reserved");
    });

    test("200 — manually set unit to Under Maintenance", async () => {
      const unit = await createUnit(property._id, landlord._id);
      const res = await api.patch(
        `/api/units/${unit._id}/status`,
        { status: "Under Maintenance" },
        token,
      );
      expect(res.status).toBe(200);
    });

    test("400 — cannot set Occupied status manually", async () => {
      const unit = await createUnit(property._id, landlord._id);
      const res = await api.patch(
        `/api/units/${unit._id}/status`,
        { status: "Occupied" },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/manually set/i);
    });

    test("400 — cannot change status of occupied unit", async () => {
      const unit = await createUnit(property._id, landlord._id, {
        status: "Occupied",
      });
      const res = await api.patch(
        `/api/units/${unit._id}/status`,
        { status: "Vacant" },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/occupied/i);
    });
  });

  // ── PATCH /api/units/:id/transfer ─────────────────────────────────────────

  describe("PATCH /api/units/:id/transfer", () => {
    test("200 — transfers tenant from one unit to another", async () => {
      const tenant = await createTenant(landlord._id);
      const unit1 = await createUnit(property._id, landlord._id, {
        unitNumber: "Transfer-A",
        status: "Occupied",
        tenant: tenant._id,
      });
      const unit2 = await createUnit(property._id, landlord._id, {
        unitNumber: "Transfer-B",
      });

      const res = await api.patch(
        `/api/units/${unit1._id}/transfer`,
        { newUnitId: unit2._id },
        token,
      );
      expect(res.status).toBe(200);

      const [updatedUnit1, updatedUnit2] = await Promise.all([
        Unit.findById(unit1._id),
        Unit.findById(unit2._id),
      ]);
      expect(updatedUnit1.status).toBe("Vacant");
      expect(updatedUnit1.tenant).toBeNull();
      expect(updatedUnit2.status).toBe("Occupied");
      expect(updatedUnit2.tenant.toString()).toBe(tenant._id.toString());
    });

    test("400 — target unit must be vacant", async () => {
      const tenant = await createTenant(landlord._id);
      const unit1 = await createUnit(property._id, landlord._id, {
        unitNumber: "Source-X",
        status: "Occupied",
        tenant: tenant._id,
      });
      const unit2 = await createUnit(property._id, landlord._id, {
        unitNumber: "Target-Y",
        status: "Occupied",
      });

      const res = await api.patch(
        `/api/units/${unit1._id}/transfer`,
        { newUnitId: unit2._id },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/vacant/i);
    });

    test("400 — source unit has no tenant to transfer", async () => {
      const unit1 = await createUnit(property._id, landlord._id, {
        unitNumber: "Empty-A",
      });
      const unit2 = await createUnit(property._id, landlord._id, {
        unitNumber: "Empty-B",
      });

      const res = await api.patch(
        `/api/units/${unit1._id}/transfer`,
        { newUnitId: unit2._id },
        token,
      );
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/units/:id (archive) ──────────────────────────────────────

  describe("DELETE /api/units/:id", () => {
    test("200 — archives vacant unit", async () => {
      const unit = await createUnit(property._id, landlord._id);
      const res = await api.delete(`/api/units/${unit._id}`, token);
      expect(res.status).toBe(200);
      const updated = await Unit.findById(unit._id);
      expect(updated.isArchived).toBe(true);
    });

    test("400 — cannot archive occupied unit", async () => {
      const unit = await createUnit(property._id, landlord._id, {
        status: "Occupied",
      });
      const res = await api.delete(`/api/units/${unit._id}`, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/occupied/i);
    });
  });
});
