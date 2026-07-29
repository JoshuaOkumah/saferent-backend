require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const {
  getLandlordWithToken,
  getTokenForUser,
  createOtherLandlord,
} = require("../helpers/auth");
const {
  createProperty,
  createUnit,
  createActiveLease,
  createTenant,
} = require("../factories");
const Property = require("../../../src/models/Property");

setupTestDB();

describe("Property Endpoints", () => {
  let token, landlord;

  beforeEach(async () => {
    ({ landlord, token } = await getLandlordWithToken({
      email: "proplandlord@test.com",
    }));
  });

  const validPayload = {
    name: "Peace Estate",
    propertyType: "Block of Flats",
    address: "No 12 Test Road",
    city: "Owerri",
    state: "Imo",
  };

  // ── POST /api/properties ─────────────────────────────────────────────────────

  describe("POST /api/properties", () => {
    test("201 — creates property successfully", async () => {
      const res = await api.post("/api/properties", validPayload, token);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Peace Estate");
      expect(res.body.data.owner.toString()).toBe(landlord._id.toString());
    });

    test("201 — property defaults to Active status", async () => {
      const res = await api.post("/api/properties", validPayload, token);
      expect(res.body.data.status).toBe("Active");
    });

    test("400 — missing name", async () => {
      const { name, ...payload } = validPayload;
      const res = await api.post("/api/properties", payload, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/name/i);
    });

    test("400 — missing property type", async () => {
      const { propertyType, ...payload } = validPayload;
      const res = await api.post("/api/properties", payload, token);
      expect(res.status).toBe(400);
    });

    test("400 — invalid property type", async () => {
      const res = await api.post(
        "/api/properties",
        {
          ...validPayload,
          propertyType: "InvalidType",
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid property type/i);
    });

    test("400 — missing address", async () => {
      const { address, ...payload } = validPayload;
      const res = await api.post("/api/properties", payload, token);
      expect(res.status).toBe(400);
    });

    test("401 — no token", async () => {
      const res = await api.post("/api/properties", validPayload);
      expect(res.status).toBe(401);
    });

    test("403 — tenant cannot create property", async () => {
      const tenantUser = await require("../../../src/models/User").create({
        name: "T",
        email: "proptenanttest@test.com",
        phone: "080111",
        password: "Pass@123",
        role: "tenant",
        isVerified: true,
        accountStatus: "Active",
      });
      const tToken = getTokenForUser(tenantUser);
      const res = await api.post("/api/properties", validPayload, tToken);
      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/properties ──────────────────────────────────────────────────────

  describe("GET /api/properties", () => {
    beforeEach(async () => {
      await createProperty(landlord._id, { name: "Estate A" });
      await createProperty(landlord._id, { name: "Estate B" });
    });

    test("200 — returns only this landlord's properties", async () => {
      const other = await createOtherLandlord({ email: "otherprops@test.com" });
      await createProperty(other._id, { name: "Other Estate" });

      const res = await api.get("/api/properties", token);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      res.body.data.forEach((p) => {
        expect(p.owner.toString()).toBe(landlord._id.toString());
      });
    });

    test("200 — includes live occupancy stats", async () => {
      const res = await api.get("/api/properties", token);
      expect(res.status).toBe(200);
      expect(res.body.data[0]).toHaveProperty("stats");
      expect(res.body.data[0].stats).toHaveProperty("total");
      expect(res.body.data[0].stats).toHaveProperty("occupancyRate");
    });

    test("200 — pagination works", async () => {
      const res = await api.get("/api/properties?page=1&limit=1", token);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    test("200 — search by name", async () => {
      const res = await api.get("/api/properties?search=Estate A", token);
      expect(res.status).toBe(200);
    });

    test("401 — no token", async () => {
      const res = await api.get("/api/properties");
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/properties/:id ──────────────────────────────────────────────────

  describe("GET /api/properties/:id", () => {
    test("200 — returns property with stats", async () => {
      const property = await createProperty(landlord._id);
      const res = await api.get(`/api/properties/${property._id}`, token);
      expect(res.status).toBe(200);
      expect(res.body.data._id.toString()).toBe(property._id.toString());
      expect(res.body.data).toHaveProperty("stats");
    });

    test("404 — property not found", async () => {
      const fakeId = new (require("mongoose").Types.ObjectId)();
      const res = await api.get(`/api/properties/${fakeId}`, token);
      expect(res.status).toBe(404);
    });

    test("404 — cannot access another landlord's property", async () => {
      const other = await createOtherLandlord({
        email: "other2props@test.com",
      });
      const otherProp = await createProperty(other._id);
      const res = await api.get(`/api/properties/${otherProp._id}`, token);
      expect(res.status).toBe(404);
    });

    test("400 — invalid MongoDB ObjectId", async () => {
      const res = await api.get("/api/properties/not-an-id", token);
      expect(res.status).toBe(400);
    });
  });

  // ── PUT /api/properties/:id ──────────────────────────────────────────────────

  describe("PUT /api/properties/:id", () => {
    test("200 — updates property fields", async () => {
      const property = await createProperty(landlord._id);
      const res = await api.put(
        `/api/properties/${property._id}`,
        {
          name: "Updated Estate",
          description: "Updated description",
        },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Updated Estate");
    });

    test("owner field cannot be changed", async () => {
      const property = await createProperty(landlord._id);
      const other = await createOtherLandlord({
        email: "ownerchange@test.com",
      });
      await api.put(
        `/api/properties/${property._id}`,
        { owner: other._id },
        token,
      );
      const updated = await Property.findById(property._id);
      expect(updated.owner.toString()).toBe(landlord._id.toString());
    });

    test("404 — cannot update another landlord's property", async () => {
      const other = await createOtherLandlord({
        email: "otherupdate@test.com",
      });
      const otherProp = await createProperty(other._id);
      const res = await api.put(
        `/api/properties/${otherProp._id}`,
        { name: "Hack" },
        token,
      );
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/properties/:id (archive) ─────────────────────────────────────

  describe("DELETE /api/properties/:id", () => {
    test("200 — archives property (soft delete)", async () => {
      const property = await createProperty(landlord._id);
      const res = await api.delete(`/api/properties/${property._id}`, token);
      expect(res.status).toBe(200);
      const updated = await Property.findById(property._id);
      expect(updated.status).toBe("Archived");
    });

    test("400 — cannot archive already archived property", async () => {
      const property = await createProperty(landlord._id, {
        status: "Archived",
      });
      const res = await api.delete(`/api/properties/${property._id}`, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already archived/i);
    });

    test("400 — cannot archive property with occupied units", async () => {
      const property = await createProperty(landlord._id);
      const unit = await createUnit(property._id, landlord._id, {
        status: "Occupied",
      });
      const res = await api.delete(`/api/properties/${property._id}`, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/occupied unit/i);
    });

    test("property is never hard deleted", async () => {
      const property = await createProperty(landlord._id);
      await api.delete(`/api/properties/${property._id}`, token);
      const found = await Property.findById(property._id);
      expect(found).toBeTruthy();
      expect(found.status).toBe("Archived");
    });
  });
});
