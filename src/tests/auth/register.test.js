require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const User = require("../../../src/models/User");

setupTestDB();

describe("POST /api/auth/register", () => {
  const validPayload = {
    name: "Emeka Landlord",
    email: "emeka@test.com",
    phone: "08012345678",
    password: "Landlord@Test1",
  };

  // ── Success cases ───────────────────────────────────────────────────────────

  test("201 — creates landlord account and sends OTP email", async () => {
    const res = await api.post("/api/auth/register", validPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.email).toBe(validPayload.email);
    expect(res.body.message).toMatch(/verification code/i);
  });

  test("201 — user is created in DB as unverified landlord", async () => {
    await api.post("/api/auth/register", validPayload);
    const user = await User.findOne({ email: validPayload.email });
    expect(user).toBeTruthy();
    expect(user.role).toBe("landlord");
    expect(user.isVerified).toBe(false);
    expect(user.accountStatus).toBe("Pending Activation");
  });

  test("201 — password is hashed in DB", async () => {
    await api.post("/api/auth/register", validPayload);
    const user = await User.findOne({ email: validPayload.email }).select(
      "+password",
    );
    expect(user.password).not.toBe(validPayload.password);
    expect(user.password).toMatch(/^\$2[ab]\$/); // bcrypt hash
  });

  // ── Validation errors ────────────────────────────────────────────────────────

  test("400 — missing name", async () => {
    const { name, ...payload } = validPayload;
    const res = await api.post("/api/auth/register", payload);
    expect(res.status).toBe(400);
  });

  test("400 — missing email", async () => {
    const { email, ...payload } = validPayload;
    const res = await api.post("/api/auth/register", payload);
    expect(res.status).toBe(400);
  });

  test("400 — missing password", async () => {
    const { password, ...payload } = validPayload;
    const res = await api.post("/api/auth/register", payload);
    expect(res.status).toBe(400);
  });

  test("400 — invalid email format", async () => {
    const res = await api.post("/api/auth/register", {
      ...validPayload,
      email: "not-an-email",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid email/i);
  });

  test("400 — password too short (less than 8 chars)", async () => {
    const res = await api.post("/api/auth/register", {
      ...validPayload,
      password: "Ab1",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 characters/i);
  });

  test("400 — password missing uppercase", async () => {
    const res = await api.post("/api/auth/register", {
      ...validPayload,
      password: "lowercase1",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/uppercase/i);
  });

  test("400 — password missing lowercase", async () => {
    const res = await api.post("/api/auth/register", {
      ...validPayload,
      password: "UPPERCASE1",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/lowercase/i);
  });

  test("400 — password missing number", async () => {
    const res = await api.post("/api/auth/register", {
      ...validPayload,
      password: "NoNumberPass",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/number/i);
  });

  test("409 — duplicate email", async () => {
    await api.post("/api/auth/register", validPayload);
    const res = await api.post("/api/auth/register", validPayload);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  test("response never returns password", async () => {
    const res = await api.post("/api/auth/register", validPayload);
    expect(res.body.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(validPayload.password);
  });
});
