require("../helpers/mocks");
const { api } = require("../helpers/request");
const { setupTestDB } = require("../helpers/db");
const { getLandlordWithToken, getTokenForUser } = require("../helpers/auth");
const {
  createProperty,
  createUnit,
  createTenant,
  createTenantUserAccount,
  createLease,
  createActiveLease,
  createAgreement,
  createFullStack,
} = require("../factories");
const RentalAgreement = require("../../../src/models/RentalAgreement");
const Lease = require("../../../src/models/Lease");
const Unit = require("../../../src/models/Unit");
const Tenant = require("../../../src/models/Tenant");

setupTestDB();

describe("Agreement Endpoints", () => {
  let stack;

  beforeEach(async () => {
    stack = await createFullStack();
  });

  // ── GET /api/agreements/:leaseId ──────────────────────────────────────────

  describe("GET /api/agreements/:leaseId", () => {
    test("200 — landlord gets agreement", async () => {
      const res = await api.get(
        `/api/agreements/${stack.lease._id}`,
        stack.landlordToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.agreementReference).toMatch(/^RS-AGR-/);
    });

    test("200 — tenant gets their agreement", async () => {
      const res = await api.get(
        `/api/agreements/${stack.lease._id}`,
        stack.tenantToken,
      );
      expect(res.status).toBe(200);
    });

    test("404 — cross-landlord blocked", async () => {
      const { landlord: other, token: otherToken } = await getLandlordWithToken(
        { email: "crossagr@test.com" },
      );
      const res = await api.get(
        `/api/agreements/${stack.lease._id}`,
        otherToken,
      );
      expect(res.status).toBe(404);
    });

    test("401 — no token", async () => {
      const res = await api.get(`/api/agreements/${stack.lease._id}`);
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/agreements/:leaseId/status ───────────────────────────────────

  describe("GET /api/agreements/:leaseId/status", () => {
    test("200 — returns signing status", async () => {
      const res = await api.get(
        `/api/agreements/${stack.lease._id}/status`,
        stack.landlordToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("status");
      expect(res.body.data).toHaveProperty("tenantSigned");
      expect(res.body.data).toHaveProperty("landlordSigned");
      expect(res.body.data).toHaveProperty("isLocked");
      expect(res.body.data).toHaveProperty("documentAvailable");
      expect(res.body.data.tenantSigned).toBe(false);
      expect(res.body.data.landlordSigned).toBe(false);
    });
  });

  // ── PATCH /api/agreements/:leaseId/landlord-sign ──────────────────────────

  describe("PATCH /api/agreements/:leaseId/landlord-sign", () => {
    test("200 — landlord signs agreement", async () => {
      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "test-nonce-land-1" },
        stack.landlordToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.signatureId).toMatch(/^RSD-L-/);
      expect(res.body.data.signedAt).toBeTruthy();
      expect(res.body.data.leaseActivated).toBe(false);
    });

    test("agreement status becomes Partially Signed after landlord signs", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "test-nonce-land-2" },
        stack.landlordToken,
      );
      const agreement = await RentalAgreement.findOne({
        lease: stack.lease._id,
      });
      expect(agreement.status).toBe("Partially Signed");
    });

    test("400 — landlord cannot sign twice", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "nonce-a" },
        stack.landlordToken,
      );
      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "nonce-b" },
        stack.landlordToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already.*signed/i);
    });

    test("403 — tenant cannot sign as landlord", async () => {
      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        {},
        stack.tenantToken,
      );
      expect(res.status).toBe(403);
    });

    test("200 — duplicate nonce returns success without duplicate signature", async () => {
      const nonce = "idempotent-nonce-landlord";
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce },
        stack.landlordToken,
      );
      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce },
        stack.landlordToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.duplicate).toBe(true);
    });
  });

  // ── PATCH /api/agreements/:leaseId/tenant-sign ────────────────────────────

  describe("PATCH /api/agreements/:leaseId/tenant-sign", () => {
    test("200 — tenant signs agreement", async () => {
      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "test-nonce-tenant-1" },
        stack.tenantToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.signatureId).toMatch(/^RSD-T-/);
      expect(res.body.data.leaseActivated).toBe(false);
    });

    test("400 — tenant cannot sign twice", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "nonce-t1" },
        stack.tenantToken,
      );
      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "nonce-t2" },
        stack.tenantToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already.*signed/i);
    });
    test("403 — landlord cannot sign as tenant", async () => {
      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        {},
        stack.landlordToken,
      );
      expect(res.status).toBe(403);
    });
  });

  // ── Both signs → lease activates ──────────────────────────────────────────

  describe("Full signing flow", () => {
    test("lease activates + unit occupied + tenant active after both sign", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "full-nonce-t" },
        stack.tenantToken,
      );

      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "full-nonce-l" },
        stack.landlordToken,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.leaseActivated).toBe(true);

      const [lease, unit, tenant, agreement] = await Promise.all([
        Lease.findById(stack.lease._id),
        Unit.findById(stack.unit._id),
        Tenant.findById(stack.tenant._id),
        RentalAgreement.findOne({ lease: stack.lease._id }),
      ]);

      expect(lease.status).toBe("Active");
      expect(unit.status).toBe("Occupied");
      expect(unit.tenant.toString()).toBe(stack.tenant._id.toString());
      expect(tenant.status).toBe("Active");
      expect(agreement.status).toBe("Completed");
      expect(agreement.isLocked).toBe(true);
      expect(agreement.lockedAt).toBeTruthy();
    });

    test("agreement is immutable after locking", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "lock-t" },
        stack.tenantToken,
      );
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "lock-l" },
        stack.landlordToken,
      );

      const res = await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "lock-l2" },
        stack.landlordToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/locked|already signed/i);
    });

    test("signature stores documentHash, signatureHash, signatureId", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "hash-t" },
        stack.tenantToken,
      );
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "hash-l" },
        stack.landlordToken,
      );

      const agreement = await RentalAgreement.findOne({
        lease: stack.lease._id,
      });
      expect(agreement.tenantSignature.documentHash).toBeTruthy();
      expect(agreement.tenantSignature.signatureHash).toBeTruthy();
      expect(agreement.tenantSignature.signatureId).toMatch(/^RSD-T-/);
      expect(agreement.landlordSignature.signatureId).toMatch(/^RSD-L-/);
    });

    test("both parties signed the same documentHash", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "same-t" },
        stack.tenantToken,
      );
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "same-l" },
        stack.landlordToken,
      );

      const agreement = await RentalAgreement.findOne({
        lease: stack.lease._id,
      });
      expect(agreement.tenantSignature.documentHash).toBe(
        agreement.landlordSignature.documentHash,
      );
    });
  });

  // ── GET /api/agreements/:leaseId/audit ────────────────────────────────────

  describe("GET /api/agreements/:leaseId/audit", () => {
    test("200 — landlord gets audit trail", async () => {
      const res = await api.get(
        `/api/agreements/${stack.lease._id}/audit`,
        stack.landlordToken,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test("403 — tenant cannot access audit trail", async () => {
      const res = await api.get(
        `/api/agreements/${stack.lease._id}/audit`,
        stack.tenantToken,
      );
      expect(res.status).toBe(403);
    });

    test("audit contains AGREEMENT_CREATED event", async () => {
      const res = await api.get(
        `/api/agreements/${stack.lease._id}/audit`,
        stack.landlordToken,
      );
      const events = res.body.data.map((e) => e.event);
      expect(events).toContain("AGREEMENT_CREATED");
    });
  });

  // ── GET /api/agreements/:leaseId/evidence ─────────────────────────────────

  describe("GET /api/agreements/:leaseId/evidence", () => {
    test("400 — evidence not available before locking", async () => {
      const res = await api.get(
        `/api/agreements/${stack.lease._id}/evidence`,
        stack.landlordToken,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/fully signed/i);
    });

    test("200 — evidence package available after both sign", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "ev-t" },
        stack.tenantToken,
      );
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "ev-l" },
        stack.landlordToken,
      );

      const res = await api.get(
        `/api/agreements/${stack.lease._id}/evidence`,
        stack.landlordToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("agreementReference");
      expect(res.body.data).toHaveProperty("document");
      expect(res.body.data).toHaveProperty("tenantSignature");
      expect(res.body.data).toHaveProperty("landlordSignature");
      expect(res.body.data).toHaveProperty("auditTrail");
      expect(res.body.data.document).toHaveProperty("documentHash");
      expect(res.body.data.document).toHaveProperty("pdfChecksum");
    });
  });

  // ── Void agreement when lease cancelled ───────────────────────────────────

  describe("Agreement voided on lease cancel", () => {
    test("agreement voided when pending lease is cancelled", async () => {
      await api.patch(
        `/api/leases/${stack.lease._id}/cancel`,
        {},
        stack.landlordToken,
      );
      const agreement = await RentalAgreement.findOne({
        lease: stack.lease._id,
      });
      expect(agreement.status).toBe("Void");
    });

    test("locked agreement cannot be voided", async () => {
      await api.patch(
        `/api/agreements/${stack.lease._id}/tenant-sign`,
        { nonce: "void-t" },
        stack.tenantToken,
      );
      await api.patch(
        `/api/agreements/${stack.lease._id}/landlord-sign`,
        { nonce: "void-l" },
        stack.landlordToken,
      );
      const agreement = await RentalAgreement.findOne({
        lease: stack.lease._id,
      });
      expect(agreement.isLocked).toBe(true);
      expect(agreement.status).toBe("Completed");
    });
  });
});
