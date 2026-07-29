require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const { createLandlord } = require("../helpers/auth");
const User = require("../../../src/models/User");

setupTestDB();

describe("POST /api/auth/login", () => {
  let landlord;

  beforeEach(async () => {
    landlord = await createLandlord({
      email: "login@test.com",
      password: "Landlord@Test1",
    });
  });

  // ── Success ──────────────────────────────────────────────────────────────────

  test("200 — returns token and user on valid credentials", async () => {
    const res = await api.post("/api/auth/login", {
      email: "login@test.com",
      password: "Landlord@Test1",
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("login@test.com");
    expect(res.body.user.role).toBe("landlord");
  });

  test("200 — response never includes password", async () => {
    const res = await api.post("/api/auth/login", {
      email: "login@test.com",
      password: "Landlord@Test1",
    });
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("Landlord@Test1");
  });

  // ── Validation ───────────────────────────────────────────────────────────────

  test("400 — missing email", async () => {
    const res = await api.post("/api/auth/login", {
      password: "Landlord@Test1",
    });
    expect(res.status).toBe(400);
  });

  test("400 — missing password", async () => {
    const res = await api.post("/api/auth/login", { email: "login@test.com" });
    expect(res.status).toBe(400);
  });

  // ── Auth errors ──────────────────────────────────────────────────────────────

  test("401 — wrong password", async () => {
    const res = await api.post("/api/auth/login", {
      email: "login@test.com",
      password: "WrongPass@1",
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  test("401 — email does not exist", async () => {
    const res = await api.post("/api/auth/login", {
      email: "nobody@test.com",
      password: "Landlord@Test1",
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  test("403 — unverified account cannot login", async () => {
    await createLandlord({
      email: "unverified@test.com",
      isVerified: false,
      accountStatus: "Pending Activation",
    });
    const res = await api.post("/api/auth/login", {
      email: "unverified@test.com",
      password: "Landlord@Test1",
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/verify your email/i);
  });

  test("423 — account locked after 10 failed attempts", async () => {
    const user = await User.findById(landlord._id);
    user.failedLoginAttempts = 9;
    await user.save();

    const res = await api.post("/api/auth/login", {
      email: "login@test.com",
      password: "WrongPass@1",
    });
    expect(res.status).toBe(423);
    expect(res.body.message).toMatch(/locked/i);
  });

  test("failed attempts reset to 0 on successful login", async () => {
    const user = await User.findById(landlord._id).select(
      "+failedLoginAttempts",
    );
    user.failedLoginAttempts = 3;
    await user.save();

    await api.post("/api/auth/login", {
      email: "login@test.com",
      password: "Landlord@Test1",
    });

    const updated = await User.findById(landlord._id).select(
      "+failedLoginAttempts",
    );
    expect(updated.failedLoginAttempts).toBe(0);
  });
});
