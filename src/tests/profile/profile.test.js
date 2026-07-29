require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const { getLandlordWithToken } = require("../helpers/auth");
const User = require("../../src/models/User");

setupTestDB();

describe("Profile Endpoints", () => {
  let token, landlord;

  beforeEach(async () => {
    ({ landlord, token } = await getLandlordWithToken({
      email: "profile@test.com",
    }));
  });

  // ── GET /api/profile ─────────────────────────────────────────────────────────

  describe("GET /api/profile", () => {
    test("200 — returns landlord profile", async () => {
      const res = await api.get("/api/profile", token);
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe("profile@test.com");
      expect(res.body.data.password).toBeUndefined();
    });

    test("401 — no token", async () => {
      const res = await api.get("/api/profile");
      expect(res.status).toBe(401);
    });
  });

  // ── PUT /api/profile ─────────────────────────────────────────────────────────

  describe("PUT /api/profile", () => {
    test("200 — updates name and phone", async () => {
      const res = await api.put(
        "/api/profile",
        { name: "Updated Name", phone: "08099001122" },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Updated Name");
      expect(res.body.data.phone).toBe("08099001122");
    });

    test("200 — updates address", async () => {
      const res = await api.put(
        "/api/profile",
        { address: "No 5 Test Road" },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.address).toBe("No 5 Test Road");
    });

    test("400 — no valid fields provided", async () => {
      const res = await api.put(
        "/api/profile",
        { role: "admin", isVerified: true },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no valid fields/i);
    });

    test("400 — name too short", async () => {
      const res = await api.put("/api/profile", { name: "E" }, token);
      expect(res.status).toBe(400);
    });

    test("role cannot be changed through profile update", async () => {
      await api.put("/api/profile", { role: "admin" }, token);
      const user = await User.findById(landlord._id);
      expect(user.role).toBe("landlord");
    });
  });

  // ── PATCH /api/profile/bank-account ──────────────────────────────────────────

  describe("PATCH /api/profile/bank-account", () => {
    const validBank = {
      bankName: "Zenith Bank",
      accountNumber: "2012345678",
      accountName: "Test Landlord",
    };

    test("200 — saves bank account", async () => {
      const res = await api.patch(
        "/api/profile/bank-account",
        validBank,
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.bankAccount.bankName).toBe("Zenith Bank");
      expect(res.body.data.bankAccount.accountNumber).toBe("2012345678");
    });

    test("200 — overwrites existing bank account", async () => {
      await api.patch("/api/profile/bank-account", validBank, token);
      const res = await api.patch(
        "/api/profile/bank-account",
        {
          ...validBank,
          bankName: "GTBank",
          accountNumber: "0123456789",
        },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.bankAccount.bankName).toBe("GTBank");
    });

    test("400 — account number not 10 digits", async () => {
      const res = await api.patch(
        "/api/profile/bank-account",
        {
          ...validBank,
          accountNumber: "12345",
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/10 digits/i);
    });

    test("400 — account number contains letters", async () => {
      const res = await api.patch(
        "/api/profile/bank-account",
        {
          ...validBank,
          accountNumber: "201234ABCD",
        },
        token,
      );
      expect(res.status).toBe(400);
    });

    test("400 — missing bank name", async () => {
      const { bankName, ...payload } = validBank;
      const res = await api.patch("/api/profile/bank-account", payload, token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/bank name/i);
    });

    test("400 — missing account name", async () => {
      const { accountName, ...payload } = validBank;
      const res = await api.patch("/api/profile/bank-account", payload, token);
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/profile/bank-account ─────────────────────────────────────────

  describe("DELETE /api/profile/bank-account", () => {
    test("200 — removes bank account", async () => {
      await api.patch(
        "/api/profile/bank-account",
        {
          bankName: "UBA",
          accountNumber: "2012345678",
          accountName: "Test",
        },
        token,
      );
      const res = await api.delete("/api/profile/bank-account", token);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/removed/i);
    });

    test("400 — no bank account to delete", async () => {
      const res = await api.delete("/api/profile/bank-account", token);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no bank account/i);
    });
  });

  // ── PATCH /api/profile/change-password ───────────────────────────────────────

  describe("PATCH /api/profile/change-password", () => {
    test("200 — changes password successfully", async () => {
      const res = await api.patch(
        "/api/profile/change-password",
        {
          currentPassword: "Landlord@Test1",
          newPassword: "NewLandlord@456",
          confirmPassword: "NewLandlord@456",
        },
        token,
      );
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/changed/i);
    });

    test("new password works for login", async () => {
      await api.patch(
        "/api/profile/change-password",
        {
          currentPassword: "Landlord@Test1",
          newPassword: "NewLandlord@456",
          confirmPassword: "NewLandlord@456",
        },
        token,
      );

      const loginRes = await api.post("/api/auth/login", {
        email: "profile@test.com",
        password: "NewLandlord@456",
      });
      expect(loginRes.status).toBe(200);
    });

    test("401 — wrong current password", async () => {
      const res = await api.patch(
        "/api/profile/change-password",
        {
          currentPassword: "WrongPass@1",
          newPassword: "NewLandlord@456",
          confirmPassword: "NewLandlord@456",
        },
        token,
      );
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/incorrect/i);
    });

    test("400 — new password same as current", async () => {
      const res = await api.patch(
        "/api/profile/change-password",
        {
          currentPassword: "Landlord@Test1",
          newPassword: "Landlord@Test1",
          confirmPassword: "Landlord@Test1",
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/different/i);
    });

    test("400 — confirm password mismatch", async () => {
      const res = await api.patch(
        "/api/profile/change-password",
        {
          currentPassword: "Landlord@Test1",
          newPassword: "NewLandlord@456",
          confirmPassword: "DifferentPass@789",
        },
        token,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/do not match/i);
    });

    test("400 — weak new password", async () => {
      const res = await api.patch(
        "/api/profile/change-password",
        {
          currentPassword: "Landlord@Test1",
          newPassword: "weakpass",
          confirmPassword: "weakpass",
        },
        token,
      );
      expect(res.status).toBe(400);
    });
  });
});
