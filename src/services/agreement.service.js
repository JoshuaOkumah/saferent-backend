const mongoose = require("mongoose");
const crypto = require("crypto");
const RentalAgreement = require("../models/RentalAgreement");
const Lease = require("../models/Lease");
const Unit = require("../models/Unit");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Property = require("../models/Property");
const {
  generateAgreementPDF,
  getAgreementType,
} = require("./agreementGenerator.service");
const {
  generateAgreementReference,
  generateSignatureId,
  generateSignatureHash,
  sha256,
} = require("../utils/crypto");
const { createAuditEvent } = require("./auditTrail.service");
const { logActivity } = require("./activityLog.service");
const ApiError = require("../utils/ApiError");

/**
 * Parse device info from user agent string.
 * Production-quality: used for audit trail.
 */
const parseUserAgent = (userAgent = "") => {
  const ua = userAgent.toLowerCase();
  let browser = "Unknown";
  let operatingSystem = "Unknown";
  let deviceType = "desktop";

  if (ua.includes("chrome") && !ua.includes("edge")) browser = "Chrome";
  else if (ua.includes("firefox")) browser = "Firefox";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari";
  else if (ua.includes("edge")) browser = "Edge";

  if (ua.includes("windows")) operatingSystem = "Windows";
  else if (ua.includes("mac os")) operatingSystem = "macOS";
  else if (ua.includes("linux")) operatingSystem = "Linux";
  else if (ua.includes("android")) operatingSystem = "Android";
  else if (ua.includes("ios") || ua.includes("iphone") || ua.includes("ipad"))
    operatingSystem = "iOS";

  if (ua.includes("mobile") || ua.includes("android")) deviceType = "mobile";
  else if (ua.includes("tablet") || ua.includes("ipad")) deviceType = "tablet";

  return { browser, operatingSystem, deviceType };
};

/**
 * Create a new agreement for a lease.
 * Called immediately after lease creation.
 */
const createAgreement = async (leaseId, session = null) => {
  const opts = session ? { session } : {};

  const lease = await Lease.findById(leaseId).session(session);
  if (!lease) throw new ApiError(404, "Lease not found");

  const [landlord, tenant, property, unit] = await Promise.all([
    User.findById(lease.landlord).session(session),
    Tenant.findById(lease.tenant).session(session),
    Property.findById(lease.property).session(session),
    Unit.findById(lease.unit).session(session),
  ]);

  const agreementReference = await generateAgreementReference(RentalAgreement);
  const agreementType = getAgreementType(lease.paymentFrequency);

  // Generate the agreement PDF
  const generated = await generateAgreementPDF({
    lease,
    landlord,
    tenant,
    property,
    unit,
    agreementReference,
  });

  const versionEntry = {
    version: 1,
    documentHash: generated.documentHash,
    pdfChecksum: generated.pdfChecksum,
    cloudinary: generated.cloudinary,
    generatedAt: generated.generatedAt,
    isActive: true,
    generationTrigger: "lease_created",
  };

  const [agreement] = await RentalAgreement.create(
    [
      {
        lease: leaseId,
        agreementReference,
        agreementType,
        currentVersion: 1,
        versions: [versionEntry],
        document: {
          publicId: generated.cloudinary.publicId,
          secureUrl: generated.cloudinary.secureUrl,
          documentHash: generated.documentHash,
          pdfChecksum: generated.pdfChecksum,
          generatedAt: generated.generatedAt,
        },
        status: "Pending",
      },
    ],
    opts,
  );

  await createAuditEvent(
    {
      agreement: agreement._id,
      agreementReference,
      event: "AGREEMENT_CREATED",
      actorRole: "system",
      agreementVersion: 1,
      documentHash: generated.documentHash,
      metadata: { leaseId, agreementType },
    },
    session,
  );

  await createAuditEvent(
    {
      agreement: agreement._id,
      agreementReference,
      event: "DOCUMENT_GENERATED",
      actorRole: "system",
      agreementVersion: 1,
      documentHash: generated.documentHash,
      metadata: {
        cloudinaryPublicId: generated.cloudinary.publicId,
        bytes: generated.cloudinary.bytes,
      },
    },
    session,
  );

  return agreement;
};

/**
 * Regenerate agreement when lease details change before signing.
 * Archives the previous version. Blocked after locking.
 */
const regenerateAgreement = async (
  leaseId,
  actorId,
  trigger = "lease_updated",
) => {
  const agreement = await RentalAgreement.findOne({ lease: leaseId });
  if (!agreement) throw new ApiError(404, "Agreement not found");

  if (agreement.isLocked) {
    throw new ApiError(
      400,
      "This agreement is locked and cannot be regenerated",
    );
  }

  const lease = await Lease.findById(leaseId);
  const [landlord, tenant, property, unit] = await Promise.all([
    User.findById(lease.landlord),
    Tenant.findById(lease.tenant),
    Property.findById(lease.property),
    Unit.findById(lease.unit),
  ]);

  // Archive all current active versions
  agreement.versions.forEach((v) => {
    if (v.isActive) {
      v.isActive = false;
      v.archivedAt = new Date();
    }
  });

  const newVersion = agreement.currentVersion + 1;

  const generated = await generateAgreementPDF({
    lease,
    landlord,
    tenant,
    property,
    unit,
    agreementReference: agreement.agreementReference,
  });

  const versionEntry = {
    version: newVersion,
    documentHash: generated.documentHash,
    pdfChecksum: generated.pdfChecksum,
    cloudinary: generated.cloudinary,
    generatedAt: generated.generatedAt,
    isActive: true,
    generationTrigger: trigger,
  };

  agreement.versions.push(versionEntry);
  agreement.currentVersion = newVersion;
  agreement.document = {
    publicId: generated.cloudinary.publicId,
    secureUrl: generated.cloudinary.secureUrl,
    documentHash: generated.documentHash,
    pdfChecksum: generated.pdfChecksum,
    generatedAt: generated.generatedAt,
  };

  // Reset any partial signatures — parties must sign the new version
  if (
    agreement.tenantSignature?.signedAt ||
    agreement.landlordSignature?.signedAt
  ) {
    agreement.tenantSignature = {};
    agreement.landlordSignature = {};
    agreement.status = "Pending";
  }

  await agreement.save();

  await createAuditEvent({
    agreement: agreement._id,
    agreementReference: agreement.agreementReference,
    event: "DOCUMENT_REGENERATED",
    actor: actorId,
    actorRole: "system",
    agreementVersion: newVersion,
    documentHash: generated.documentHash,
    metadata: { previousVersion: newVersion - 1, trigger },
  });

  return agreement;
};

/**
 * Core integrity check before any signature is accepted.
 */
const verifyAgreementIntegrity = async (agreementId) => {
  const agreement = await RentalAgreement.findById(agreementId);
  if (!agreement) throw new ApiError(404, "Agreement not found");
  if (agreement.isLocked)
    throw new ApiError(400, "Agreement is already locked");
  if (agreement.status === "Void")
    throw new ApiError(400, "Agreement has been voided");
  if (!agreement.document?.documentHash) {
    throw new ApiError(400, "Agreement document has not been generated yet");
  }
  if (!agreement.document?.secureUrl) {
    throw new ApiError(400, "Agreement document is not available");
  }

  // Confirm active version matches current document hash
  const activeVersion = agreement.versions.find((v) => v.isActive);
  if (!activeVersion)
    throw new ApiError(500, "No active agreement version found");

  if (activeVersion.documentHash !== agreement.document.documentHash) {
    throw new ApiError(
      409,
      "Document integrity check failed. The agreement has been modified. Please contact support.",
    );
  }

  return { agreement, activeVersion };
};

/**
 * Process a signature — called by both landlord and tenant signing controllers.
 * Wrapped in a MongoDB transaction.
 */
const processSignature = async ({
  leaseId,
  signerUserId,
  signerRole,
  signerEmail,
  signerName,
  ipAddress,
  userAgent,
  timezone,
  nonce,
}) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      // ── Idempotency check ───────────────────────────────────────────────
      const agreementCheck = await RentalAgreement.findOne({ lease: leaseId })
        .select("+signingNonces")
        .session(session);

      if (!agreementCheck) throw new ApiError(404, "Agreement not found");

      if (nonce && agreementCheck.signingNonces.includes(nonce)) {
        // Duplicate request — return success silently
        result = { duplicate: true, agreement: agreementCheck };
        return;
      }

      // ── Integrity check ─────────────────────────────────────────────────
      const { agreement, activeVersion } = await verifyAgreementIntegrity(
        agreementCheck._id,
      );

      // ── Check not already signed by this party ──────────────────────────
      const existingSig =
        signerRole === "landlord"
          ? agreement.landlordSignature
          : agreement.tenantSignature;

      if (existingSig?.signedAt) {
        throw new ApiError(
          400,
          `This agreement has already been signed by the ${signerRole}`,
        );
      }

      // ── Build signature ──────────────────────────────────────────────────
      const signatureId = generateSignatureId(signerRole);
      const signatureHash = generateSignatureHash(
        signerUserId.toString(),
        agreement.document.documentHash,
        signerRole,
      );
      const { browser, operatingSystem, deviceType } =
        parseUserAgent(userAgent);

      const signature = {
        signatureId,
        signedAt: new Date(),
        ipAddress,
        userAgent,
        browser,
        operatingSystem,
        deviceType,
        signerRole,
        signerId: signerUserId,
        signerEmail,
        signerName,
        agreementVersion: activeVersion.version,
        agreementReference: agreement.agreementReference,
        documentHash: agreement.document.documentHash,
        pdfChecksum: agreement.document.pdfChecksum,
        signatureHash,
        timezone: timezone || "Africa/Lagos",
        locale: "en-NG",
        signingMethod: "password_confirmation",
        verifiedAt: new Date(),
        verificationStatus: "verified",
      };

      // ── Apply signature ──────────────────────────────────────────────────
      if (signerRole === "landlord") {
        agreement.landlordSignature = signature;
      } else {
        agreement.tenantSignature = signature;
      }

      // ── Determine new status ─────────────────────────────────────────────
      const tenantSigned =
        signerRole === "tenant" ? true : !!agreement.tenantSignature?.signedAt;
      const landlordSigned =
        signerRole === "landlord"
          ? true
          : !!agreement.landlordSignature?.signedAt;

      const bothSigned = tenantSigned && landlordSigned;

      if (bothSigned) {
        agreement.status = "Completed";
        agreement.isLocked = true;
        agreement.lockedAt = new Date();
      } else {
        agreement.status = "Partially Signed";
      }

      // ── Add nonce ────────────────────────────────────────────────────────
      if (nonce) {
        agreement.signingNonces.push(nonce);
        // Keep last 20 nonces only
        if (agreement.signingNonces.length > 20) {
          agreement.signingNonces = agreement.signingNonces.slice(-20);
        }
      }

      await agreement.save({ session });

      // ── If both signed — activate lease, occupy unit, activate tenant ────
      if (bothSigned) {
        const lease = await Lease.findById(leaseId).session(session);
        lease.status = "Active";
        await lease.save({ session });

        const unit = await Unit.findById(lease.unit).session(session);
        unit.status = "Occupied";
        unit.tenant = lease.tenant;
        await unit.save({ session });

        const tenant = await Tenant.findById(lease.tenant).session(session);
        tenant.status = "Active";
        await tenant.save({ session });

        await createAuditEvent(
          {
            agreement: agreement._id,
            agreementReference: agreement.agreementReference,
            event: "AGREEMENT_LOCKED",
            actor: signerUserId,
            actorRole: signerRole,
            actorEmail: signerEmail,
            actorName: signerName,
            ipAddress,
            userAgent,
            agreementVersion: activeVersion.version,
            documentHash: agreement.document.documentHash,
            metadata: { signatureId, triggeredActivation: true },
          },
          session,
        );

        await createAuditEvent(
          {
            agreement: agreement._id,
            agreementReference: agreement.agreementReference,
            event: "LEASE_ACTIVATED",
            actorRole: "system",
            agreementVersion: activeVersion.version,
            metadata: { leaseId: lease._id.toString() },
          },
          session,
        );

        await logActivity({
          actor: signerUserId,
          action: "LEASE_CREATED",
          entity: "Lease",
          entityId: lease._id,
          meta: {
            trigger: "Both parties signed agreement",
            agreementReference: agreement.agreementReference,
          },
        });
      }

      // ── Audit the signing event ──────────────────────────────────────────
      const auditEvent =
        signerRole === "landlord" ? "LANDLORD_SIGNED" : "TENANT_SIGNED";

      await createAuditEvent(
        {
          agreement: agreement._id,
          agreementReference: agreement.agreementReference,
          event: auditEvent,
          actor: signerUserId,
          actorRole: signerRole,
          actorEmail: signerEmail,
          actorName: signerName,
          ipAddress,
          userAgent,
          agreementVersion: activeVersion.version,
          documentHash: agreement.document.documentHash,
          metadata: { signatureId, signatureHash },
        },
        session,
      );

      result = { duplicate: false, agreement, activated: bothSigned };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Void an agreement — called when lease is cancelled or invitation expires.
 */
const voidAgreement = async (leaseId, actorId = null, session = null) => {
  const agreement = await RentalAgreement.findOne({ lease: leaseId }).session(
    session,
  );
  if (!agreement || agreement.isLocked) return;

  agreement.status = "Void";
  await agreement.save({ session });

  await createAuditEvent(
    {
      agreement: agreement._id,
      agreementReference: agreement.agreementReference,
      event: "AGREEMENT_VOIDED",
      actor: actorId,
      actorRole: actorId ? "landlord" : "system",
      metadata: { leaseId },
    },
    session,
  );
};

module.exports = {
  createAgreement,
  regenerateAgreement,
  verifyAgreementIntegrity,
  processSignature,
  voidAgreement,
};
