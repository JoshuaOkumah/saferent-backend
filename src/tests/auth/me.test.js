require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const { getLandlordWithToken } = require("../helpers/auth");

setupTestDB();

describe("GET /api/auth/me", () => {
  test("200 — returns current user profile", async () => {
    const { landlord, token } = await getLandlordWithToken({
      email: "me@test.com",
    });
    const res = await api.get("/api/auth/me", token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.email).toBe("me@test.com");
    expect(res.body.user.role).toBe("landlord");
  });

  test("response never contains password", async () => {
    const { token } = await getLandlordWithToken({ email: "me2@test.com" });
    const res = await api.get("/api/auth/me", token);
    expect(res.body.user.password).toBeUndefined();
  });

  test("401 — no token", async () => {
    const res = await api.get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/not authenticated/i);
  });

  test("401 — invalid token", async () => {
    const res = await api.get("/api/auth/me", "invalid.token.here");
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid token/i);
  });

  test("401 — malformed bearer header", async () => {
    const res = await require("supertest")(require("../../../src/app"))
      .get("/api/auth/me")
      .set("Authorization", "NotBearer token");
    expect(res.status).toBe(401);
  });
});
