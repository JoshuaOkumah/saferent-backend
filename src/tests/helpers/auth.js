const request = require("supertest");
const app = require("../../../src/app");
const User = require("../../../src/models/User");
const { generateToken } = require("../../../src/utils/jwt");

/**
 * Create a landlord User directly in DB (bypasses OTP).
 * Returns the user document.
 */
const createLandlord = async (overrides = {}) => {
  const data = {
    name: overrides.name || "Test Landlord",
    email: overrides.email || "landlord@test.com",
    phone: overrides.phone || "08012345678",
    password: overrides.password || "Landlord@Test1",
    role: "landlord",
    provider: "local",
    isVerified: true,
    accountStatus: "Active",
    ...overrides,
  };
  return User.create(data);
};

/**
 * Create a second landlord for cross-authorization tests.
 */
const createOtherLandlord = async (overrides = {}) => {
  return createLandlord({
    name: "Other Landlord",
    email: "other@test.com",
    phone: "08087654321",
    ...overrides,
  });
};

/**
 * Create a tenant User account directly in DB.
 * Usually you'd use the full onboarding flow — this is for unit tests.
 */
const createTenantUser = async (tenantProfileId, overrides = {}) => {
  return User.create({
    name: overrides.name || "Test Tenant",
    email: overrides.email || "tenant@test.com",
    phone: overrides.phone || "08099887766",
    password: overrides.password || "Tenant@Test1",
    role: "tenant",
    provider: "local",
    isVerified: true,
    accountStatus: "Active",
    tenantProfile: tenantProfileId,
    ...overrides,
  });
};

/**
 * Generate a JWT for a user — no HTTP call needed.
 */
const getTokenForUser = (user) => {
  return generateToken({ id: user._id, role: user.role });
};

/**
 * Get a landlord + their auth token in one call.
 */
const getLandlordWithToken = async (overrides = {}) => {
  const landlord = await createLandlord(overrides);
  const token = getTokenForUser(landlord);
  return { landlord, token };
};

/**
 * Get a tenant user + their auth token.
 */
const getTenantWithToken = async (tenantProfileId, overrides = {}) => {
  const tenantUser = await createTenantUser(tenantProfileId, overrides);
  const token = getTokenForUser(tenantUser);
  return { tenantUser, token };
};

/**
 * Auth header helper for supertest requests.
 */
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = {
  createLandlord,
  createOtherLandlord,
  createTenantUser,
  getTokenForUser,
  getLandlordWithToken,
  getTenantWithToken,
  authHeader,
};
