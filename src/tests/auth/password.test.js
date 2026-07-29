require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const { createLandlord } = require("../helpers/auth");
const User = require("../../../src/models/User");
const bcrypt = require("bcryptjs");

setupTestDB();

describe("Password Reset Flow", () => {
  let landlord;

  beforeEach(async () => {
    landlord = await createLandlord({ email: "reset@test.com" });
  });

  // ── Forgot Password ──────────────────────────────────────────────────────────

  describe("POST /api/auth/forgot-password", () => {
    test("200 — always returns success (does not leak email existence)", async () => {
      const res = await api.post("/api/auth/forgot-password", {
        email: "reset@test.com",
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/if an account/i);
    });

    test("200 — same message for non-existent email (prevents enumeration)", async () => {
      const res = await api.post("/api/auth/forgot-password", {
        email: "nobody@test.com",
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account/i);
    });

    test("200 — OTP hash stored on user after request", async () => {
      await api.post("/api/auth/forgot-password", { email: "reset@test.com" });
      const user = await User.findOne({ email: "reset@test.com" }).select(
        "+passwordResetOtpHash",
      );
      expect(user.passwordResetOtpHash).toBeTruthy();
      expect(user.passwordResetExpiry).toBeTruthy();
    });

    test("400 — missing email", async () => {
      const res = await api.post("/api/auth/forgot-password", {});
      expect(res.status).toBe(400);
    });
  });

  // ── Reset Password ───────────────────────────────────────────────────────────

  describe("POST /api/auth/reset-password", () => {
    let otp;

    beforeEach(async () => {
      // Manually plant an OTP on the user for testing
      otp = "123456";
      const hash = await bcrypt.hash(otp, 10);
      await User.findByIdAndUpdate(landlord._id, {
        passwordResetOtpHash: hash,
        passwordResetExpiry: new Date(Date.now() + 10 * 60 * 1000),
      });
    });

    test("200 — resets password with valid OTP", async () => {
      const res = await api.post("/api/auth/reset-password", {
        email: "reset@test.com",
        otp,
        newPassword: "NewLandlord@456",
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/reset successful/i);
    });

    test("new password works for login after reset", async () => {
      await api.post("/api/auth/reset-password", {
        email: "reset@test.com",
        otp,
        newPassword: "NewLandlord@456",
      });

      const loginRes = await api.post("/api/auth/login", {
        email: "reset@test.com",
        password: "NewLandlord@456",
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeTruthy();
    });

    test("OTP cleared after successful reset", async () => {
      await api.post("/api/auth/reset-password", {
        email: "reset@test.com",
        otp,
        newPassword: "NewLandlord@456",
      });

      const user = await User.findOne({ email: "reset@test.com" }).select(
        "+passwordResetOtpHash",
      );
      expect(user.passwordResetOtpHash).toBeNull();
      expect(user.passwordResetExpiry).toBeNull();
    });

    test("400 — wrong OTP", async () => {
      const res = await api.post("/api/auth/reset-password", {
        email: "reset@test.com",
        otp: "999999",
        newPassword: "NewLandlord@456",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid/i);
    });

    test("400 — expired OTP", async () => {
      await User.findByIdAndUpdate(landlord._id, {
        passwordResetExpiry: new Date(Date.now() - 1000),
      });

      const res = await api.post("/api/auth/reset-password", {
        email: "reset@test.com",
        otp,
        newPassword: "NewLandlord@456",
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/expired/i);
    });

    test("400 — weak new password rejected", async () => {
      const res = await api.post("/api/auth/reset-password", {
        email: "reset@test.com",
        otp,
        newPassword: "weakpass",
      });
      expect(res.status).toBe(400);
    });

    test("400 — missing fields", async () => {
      const res = await api.post("/api/auth/reset-password", {
        email: "reset@test.com",
      });
      expect(res.status).toBe(400);
    });
  });
});
