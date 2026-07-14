const RentalAgreement = require("../models/RentalAgreement");
const AgreementAudit = require("../models/AgreementAudit");
const Lease = require("../models/Lease");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const {
  processSignature,
  voidAgreement,
  verifyAgreementIntegrity,
} = require("../services/agreement.service");
const { createAuditEvent } = require("../services/auditTrail.service");

// ─── GET /api/agreements/:leaseId ─────────────────────────────────────────────
const getAgreement = async (req, res) => {
  const leaseId = req.params.leaseId;

  // Landlord can access their own lease's agreement
  // Tenant can access their own lease's agreement
  let lease;
  if (req.user.role === "landlord" || req.user.role === "admin") {
    lease = await Lease.findOne({ _id: leaseId, landlord: req.user.id });
  } else {
    // Tenant — find their tenant profile then check if this lease belongs to them
    const userAccount = await User.findById(req.user.id);
    if (!userAccount?.tenantProfile)
      throw new ApiError(403, "Tenant profile not found");
    lease = await Lease.findOne({
      _id: leaseId,
      tenant: userAccount.tenantProfile,
    });
  }

  if (!lease) throw new ApiError(404, "Lease not found");

  const agreement = await RentalAgreement.findOne({ lease: leaseId }).populate({
    path: "lease",
    populate: [
      { path: "tenant", select: "firstName lastName email phone" },
      { path: "unit", select: "unitNumber unitType" },
      { path: "property", select: "name address city state" },
      { path: "landlord", select: "name email phone" },
    ],
  });

  if (!agreement) throw new ApiError(404, "Agreement not found");

  // Log view event
  await createAuditEvent({
    agreement: agreement._id,
    agreementReference: agreement.agreementReference,
    event: "DOCUMENT_VIEWED",
    actor: req.user.id,
    actorRole: req.user.role,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    agreementVersion: agreement.currentVersion,
    documentHash: agreement.document?.documentHash,
  });

  res.status(200).json({ success: true, data: agreement });
};

// ─── GET /api/agreements/:leaseId/status ─────────────────────────────────────
const getSigningStatus = async (req, res) => {
  const agreement = await RentalAgreement.findOne({
    lease: req.params.leaseId,
  }).select(
    "status isLocked currentVersion tenantSignature landlordSignature document agreementReference",
  );

  if (!agreement) throw new ApiError(404, "Agreement not found");

  res.status(200).json({
    success: true,
    data: {
      agreementReference: agreement.agreementReference,
      status: agreement.status,
      isLocked: agreement.isLocked,
      currentVersion: agreement.currentVersion,
      documentAvailable: !!agreement.document?.secureUrl,
      documentUrl: agreement.isLocked
        ? agreement.document?.secureUrl
        : undefined,
      tenantSigned: !!agreement.tenantSignature?.signedAt,
      tenantSignedAt: agreement.tenantSignature?.signedAt || null,
      tenantSignatureId: agreement.tenantSignature?.signatureId || null,
      landlordSigned: !!agreement.landlordSignature?.signedAt,
      landlordSignedAt: agreement.landlordSignature?.signedAt || null,
      landlordSignatureId: agreement.landlordSignature?.signatureId || null,
    },
  });
};

// ─── PATCH /api/agreements/:leaseId/tenant-sign ───────────────────────────────
const tenantSign = async (req, res) => {
  if (req.user.role !== "tenant") {
    throw new ApiError(403, "Only tenants can sign as tenant");
  }

  const { nonce, timezone } = req.body;

  // Resolve tenant's profile and email
  const userAccount = await User.findById(req.user.id);
  if (!userAccount?.tenantProfile)
    throw new ApiError(403, "Tenant profile not found");

  const tenantProfile = await Tenant.findById(userAccount.tenantProfile);
  if (!tenantProfile) throw new ApiError(403, "Tenant profile not found");

  // Verify this lease belongs to this tenant
  const lease = await Lease.findOne({
    _id: req.params.leaseId,
    tenant: tenantProfile._id,
  });
  if (!lease) throw new ApiError(404, "Lease not found");

  // Audit: started signing
  const agreementForAudit = await RentalAgreement.findOne({
    lease: req.params.leaseId,
  });
  if (agreementForAudit) {
    await createAuditEvent({
      agreement: agreementForAudit._id,
      agreementReference: agreementForAudit.agreementReference,
      event: "TENANT_STARTED_SIGNING",
      actor: req.user.id,
      actorRole: "tenant",
      actorEmail: userAccount.email,
      actorName: userAccount.name,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      agreementVersion: agreementForAudit.currentVersion,
    });
  }

  const result = await processSignature({
    leaseId: req.params.leaseId,
    signerUserId: req.user.id,
    signerRole: "tenant",
    signerEmail: userAccount.email,
    signerName: userAccount.name,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || "",
    timezone: timezone || "Africa/Lagos",
    nonce,
  });

  if (result.duplicate) {
    return res.status(200).json({
      success: true,
      message: "Signature already recorded",
      data: { duplicate: true },
    });
  }

  const message = result.activated
    ? "Agreement signed. Both parties have signed — your lease is now active and your unit is assigned."
    : "Agreement signed successfully. Awaiting landlord signature.";

  res.status(200).json({
    success: true,
    message,
    data: {
      agreementReference: result.agreement.agreementReference,
      status: result.agreement.status,
      signatureId: result.agreement.tenantSignature.signatureId,
      signedAt: result.agreement.tenantSignature.signedAt,
      leaseActivated: result.activated,
    },
  });
};

// ─── PATCH /api/agreements/:leaseId/landlord-sign ────────────────────────────
const landlordSign = async (req, res) => {
  if (!["landlord", "admin"].includes(req.user.role)) {
    throw new ApiError(403, "Only landlords can sign as landlord");
  }

  const { nonce, timezone } = req.body;

  const lease = await Lease.findOne({
    _id: req.params.leaseId,
    landlord: req.user.id,
  });
  if (!lease) throw new ApiError(404, "Lease not found");

  const landlord = await User.findById(req.user.id);

  // Audit: started signing
  const agreementForAudit = await RentalAgreement.findOne({
    lease: req.params.leaseId,
  });
  if (agreementForAudit) {
    await createAuditEvent({
      agreement: agreementForAudit._id,
      agreementReference: agreementForAudit.agreementReference,
      event: "LANDLORD_STARTED_SIGNING",
      actor: req.user.id,
      actorRole: "landlord",
      actorEmail: landlord.email,
      actorName: landlord.name,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      agreementVersion: agreementForAudit.currentVersion,
    });
  }

  const result = await processSignature({
    leaseId: req.params.leaseId,
    signerUserId: req.user.id,
    signerRole: "landlord",
    signerEmail: landlord.email,
    signerName: landlord.name,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || "",
    timezone: timezone || "Africa/Lagos",
    nonce,
  });

  if (result.duplicate) {
    return res.status(200).json({
      success: true,
      message: "Signature already recorded",
      data: { duplicate: true },
    });
  }

  const message = result.activated
    ? "Agreement signed. Both parties have signed — the lease is now active and the unit is occupied."
    : "Agreement signed successfully. Awaiting tenant signature.";

  res.status(200).json({
    success: true,
    message,
    data: {
      agreementReference: result.agreement.agreementReference,
      status: result.agreement.status,
      signatureId: result.agreement.landlordSignature.signatureId,
      signedAt: result.agreement.landlordSignature.signedAt,
      leaseActivated: result.activated,
    },
  });
};

// ─── GET /api/agreements/:leaseId/audit ───────────────────────────────────────
const getAuditTrail = async (req, res) => {
  // Only landlords and admins can see the full audit trail
  const lease = await Lease.findOne({
    _id: req.params.leaseId,
    landlord: req.user.id,
  });
  if (!lease) throw new ApiError(404, "Lease not found");

  const agreement = await RentalAgreement.findOne({
    lease: req.params.leaseId,
  });
  if (!agreement) throw new ApiError(404, "Agreement not found");

  const audit = await AgreementAudit.find({ agreement: agreement._id }).sort({
    createdAt: 1,
  });

  res.status(200).json({
    success: true,
    count: audit.length,
    data: audit,
  });
};

// ─── GET /api/agreements/:leaseId/evidence ────────────────────────────────────
// Returns the complete evidence package for a locked agreement
const getEvidencePackage = async (req, res) => {
  const lease = await Lease.findOne({
    _id: req.params.leaseId,
    landlord: req.user.id,
  });
  if (!lease) throw new ApiError(404, "Lease not found");

  const agreement = await RentalAgreement.findOne({
    lease: req.params.leaseId,
  }).populate({
    path: "lease",
    populate: [
      { path: "tenant", select: "firstName lastName email phone" },
      { path: "unit", select: "unitNumber" },
      { path: "property", select: "name address" },
    ],
  });

  if (!agreement) throw new ApiError(404, "Agreement not found");

  if (!agreement.isLocked) {
    throw new ApiError(
      400,
      "Evidence package is only available after the agreement is fully signed and locked",
    );
  }

  const auditTrail = await AgreementAudit.find({
    agreement: agreement._id,
  }).sort({ createdAt: 1 });

  res.status(200).json({
    success: true,
    data: {
      agreementReference: agreement.agreementReference,
      agreementType: agreement.agreementType,
      status: agreement.status,
      lockedAt: agreement.lockedAt,

      document: {
        url: agreement.document.secureUrl,
        documentHash: agreement.document.documentHash,
        pdfChecksum: agreement.document.pdfChecksum,
        generatedAt: agreement.document.generatedAt,
      },

      tenantSignature: agreement.tenantSignature,
      landlordSignature: agreement.landlordSignature,

      auditTrail,

      parties: {
        lease: agreement.lease,
      },
    },
  });
};

module.exports = {
  getAgreement,
  getSigningStatus,
  tenantSign,
  landlordSign,
  getAuditTrail,
  getEvidencePackage,
};
