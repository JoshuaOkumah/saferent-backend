require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const {
  getLandlordWithToken,
  getTokenForUser,
  createLandlord,
} = require("../helpers/auth");
const jwt = require("jsonwebtoken");
const User = require("../../src/models/User");

setupTestDB();

describe("Middleware", () => {
  // ── protect middleware ─────────────────────────────────────────────────────

  describe("protect middleware", () => {
    test("401 — no Authorization header", async () => {
      const res = await api.get("/api/profile");
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/not authenticated/i);
    });

    test("401 — Bearer prefix missing", async () => {
      const res = await require("supertest")(require("../../src/app"))
        .get("/api/profile")
        .set("Authorization", "token-without-bearer");
      expect(res.status).toBe(401);
    });

    test("401 — expired JWT", async () => {
      const expiredToken = jwt.sign(
        { id: new (require("mongoose").Types.ObjectId)(), role: "landlord" },
        process.env.JWT_SECRET,
        { expiresIn: "0s" },
      );
      await new Promise((r) => setTimeout(r, 10));
      const res = await api.get("/api/profile", expiredToken);
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired/i);
    });

    test("401 — tampered JWT", async () => {
      const { token } = await getLandlordWithToken({
        email: "tamper@test.com",
      });
      const tampered = token.slice(0, -5) + "XXXXX";
      const res = await api.get("/api/profile", tampered);
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/invalid token/i);
    });

    test("401 — token for deleted user", async () => {
      const landlord = await createLandlord({ email: "deleted@test.com" });
      const token = getTokenForUser(landlord);
      await User.findByIdAndDelete(landlord._id);
      const res = await api.get("/api/profile", token);
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/no longer exists/i);
    });

    test("200 — valid token passes through", async () => {
      const { token } = await getLandlordWithToken({
        email: "validmw@test.com",
      });
      const res = await api.get("/api/profile", token);
      expect(res.status).toBe(200);
    });
  });

  // ── restrictTo middleware ──────────────────────────────────────────────────

  describe("restrictTo middleware", () => {
    test("403 — tenant blocked from landlord routes", async () => {
      const tenantUser = await User.create({
        name: "T",
        email: "restrict_t@test.com",
        phone: "080111",
        password: "Pass@Test1",
        role: "tenant",
        isVerified: true,
        accountStatus: "Active",
      });
      const tToken = getTokenForUser(tenantUser);
      const res = await api.post(
        "/api/properties",
        {
          name: "P",
          propertyType: "Duplex",
          address: "A",
          city: "C",
          state: "S",
        },
        tToken,
      );
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/access denied/i);
    });

    test("403 — landlord blocked from tenant-only routes", async () => {
      const { token } = await getLandlordWithToken({
        email: "landlord_restrict@test.com",
      });
      const res = await api.get("/api/tenants/me", token);
      expect(res.status).toBe(403);
    });

    test("200 — landlord allowed on landlord routes", async () => {
      const { token } = await getLandlordWithToken({
        email: "landlord_allow@test.com",
      });
      const res = await api.get("/api/properties", token);
      expect(res.status).toBe(200);
    });
  });

  // ── errorHandler middleware ────────────────────────────────────────────────

  describe("errorHandler middleware", () => {
    test("400 — invalid MongoDB ObjectId returns clean error", async () => {
      const { token } = await getLandlordWithToken({
        email: "casttest@test.com",
      });
      const res = await api.get("/api/properties/not-valid-id", token);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeTruthy();
    });

    test("404 — unknown route returns 404", async () => {
      const res = await api.get("/api/unknown-route-xyz");
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not found/i);
    });

    test("success: false is always present on errors", async () => {
      const res = await api.get("/api/profile");
      expect(res.body.success).toBe(false);
    });
  });

  // ── sanitize middleware ────────────────────────────────────────────────────

  describe("sanitize middleware", () => {
    test("leading/trailing whitespace is trimmed from string fields", async () => {
      const { token } = await getLandlordWithToken({
        email: "sanitize@test.com",
      });
      const res = await api.put(
        "/api/profile",
        { name: "  Trimmed Name  ", phone: "08012345678" },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Trimmed Name");
    });
  });

  // ── validate middleware ────────────────────────────────────────────────────

  describe("validate middleware", () => {
    test("first validation error message is returned", async () => {
      const res = await api.post("/api/auth/register", {
        email: "bad",
        password: "w",
      });
      expect(res.status).toBe(400);
      expect(typeof res.body.message).toBe("string");
    });
  });
});
