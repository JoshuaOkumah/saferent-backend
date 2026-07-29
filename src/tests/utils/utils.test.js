const {
  numberToWords,
  toNairaWords,
} = require("../../src/utils/numberToWords");
const {
  sha256,
  generateSignatureHash,
  generateSignatureId,
  formatDateLong,
  formatDateShort,
} = require("../../src/utils/crypto");
const validatePassword = require("../../src/utils/validatePassword");
const ApiError = require("../../src/utils/ApiError");
const { generateToken, verifyToken } = require("../../src/utils/jwt");

// ── numberToWords ─────────────────────────────────────────────────────────────

describe("numberToWords utility", () => {
  test("converts zero", () => {
    expect(numberToWords(0)).toBe("Zero");
  });

  test("converts hundreds", () => {
    expect(numberToWords(100)).toBe("One Hundred");
  });

  test("converts thousands", () => {
    expect(numberToWords(1000)).toBe("One Thousand");
  });

  test("converts 500000", () => {
    expect(numberToWords(500000)).toBe("Five Hundred Thousand");
  });

  test("converts 1500000", () => {
    expect(numberToWords(1500000)).toBe("One Million Five Hundred Thousand");
  });

  test("toNairaWords formats with Naira and Only", () => {
    expect(toNairaWords(500000)).toBe("Five Hundred Thousand Naira Only");
  });

  test("toNairaWords handles kobo", () => {
    const result = toNairaWords(500000.5);
    expect(result).toMatch(/Fifty Kobo/);
  });
});

// ── crypto utilities ──────────────────────────────────────────────────────────

describe("crypto utilities", () => {
  test("sha256 returns 64-char hex string", () => {
    const hash = sha256("test content");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  test("sha256 is deterministic", () => {
    expect(sha256("same input")).toBe(sha256("same input"));
  });

  test("sha256 changes when content changes", () => {
    expect(sha256("content A")).not.toBe(sha256("content B"));
  });

  test("generateSignatureId produces RSD-L prefix for landlord", () => {
    const id = generateSignatureId("landlord");
    expect(id).toMatch(/^RSD-L-[A-F0-9]{16}$/);
  });

  test("generateSignatureId produces RSD-T prefix for tenant", () => {
    const id = generateSignatureId("tenant");
    expect(id).toMatch(/^RSD-T-[A-F0-9]{16}$/);
  });

  test("generateSignatureId produces unique values", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => generateSignatureId("landlord")),
    );
    expect(ids.size).toBe(100);
  });

  test("generateSignatureHash returns hex string", () => {
    const hash = generateSignatureHash("user123", "dochash456", "landlord");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  test("generateSignatureHash is unique per call (random component)", () => {
    const h1 = generateSignatureHash("user123", "dochash456", "landlord");
    const h2 = generateSignatureHash("user123", "dochash456", "landlord");
    expect(h1).not.toBe(h2);
  });

  test("formatDateLong returns human readable string", () => {
    const result = formatDateLong(new Date("2026-07-01"));
    expect(result).toMatch(/1st day of July 2026/);
  });

  test("formatDateShort returns compact string", () => {
    const result = formatDateShort(new Date("2026-07-01"));
    expect(result).toMatch(/1st July 2026/);
  });
});

// ── validatePassword ──────────────────────────────────────────────────────────

describe("validatePassword utility", () => {
  test("passes valid password", () => {
    expect(() => validatePassword("Secure@123")).not.toThrow();
  });

  test("throws on password shorter than 8 chars", () => {
    expect(() => validatePassword("Ab1")).toThrow(/8 characters/i);
  });

  test("throws on missing uppercase", () => {
    expect(() => validatePassword("lowercase1")).toThrow(/uppercase/i);
  });

  test("throws on missing lowercase", () => {
    expect(() => validatePassword("UPPERCASE1")).toThrow(/lowercase/i);
  });

  test("throws on missing number", () => {
    expect(() => validatePassword("NoNumbers")).toThrow(/number/i);
  });

  test("throws on empty string", () => {
    expect(() => validatePassword("")).toThrow();
  });

  test("throws on null/undefined", () => {
    expect(() => validatePassword(null)).toThrow();
    expect(() => validatePassword(undefined)).toThrow();
  });
});

// ── ApiError ──────────────────────────────────────────────────────────────────

describe("ApiError", () => {
  test("creates error with correct statusCode and message", () => {
    const err = new ApiError(404, "Not found");
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.isOperational).toBe(true);
  });

  test("is instanceof Error", () => {
    const err = new ApiError(400, "Bad request");
    expect(err instanceof Error).toBe(true);
  });

  test("has stack trace", () => {
    const err = new ApiError(500, "Server error");
    expect(err.stack).toBeTruthy();
  });
});

// ── JWT utilities ─────────────────────────────────────────────────────────────

describe("JWT utilities", () => {
  const payload = { id: "user123", role: "landlord" };

  test("generateToken creates a signed JWT", () => {
    const token = generateToken(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  test("verifyToken decodes a valid token", () => {
    const token = generateToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.id).toBe("user123");
    expect(decoded.role).toBe("landlord");
  });

  test("verifyToken throws on invalid token", () => {
    expect(() => verifyToken("invalid.token.here")).toThrow();
  });

  test("verifyToken throws on expired token", () => {
    const expired = require("jsonwebtoken").sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "0s" },
    );
    expect(() => verifyToken(expired)).toThrow();
  });
});
