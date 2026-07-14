const mongoose = require("mongoose");

// ─── Signature sub-schema — production-grade ──────────────────────────────────
const signatureSchema = new mongoose.Schema(
  {
    signatureId: { type: String, default: null },
    signedAt: { type: Date, default: null },

    // Network identity
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },

    // Parsed device info (populated from userAgent on the server)
    browser: { type: String, default: null },
    operatingSystem: { type: String, default: null },
    deviceType: { type: String, default: null }, // desktop | mobile | tablet

    // Signer identity
    signerRole: { type: String, enum: ["landlord", "tenant"], default: null },
    signerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    signerEmail: { type: String, default: null },
    signerName: { type: String, default: null },

    // Agreement version signed
    agreementVersion: { type: Number, default: null },
    agreementReference: { type: String, default: null },

    // Document integrity at time of signing
    // Both parties must sign the SAME documentHash
    documentHash: { type: String, default: null },
    pdfChecksum: { type: String, default: null },

    // Cryptographic signature hash — HMAC-based, not a timestamp token
    signatureHash: { type: String, default: null },

    // Locale and timezone
    timezone: { type: String, default: null },
    locale: { type: String, default: "en-NG" },

    // Verification
    signingMethod: {
      type: String,
      enum: ["password_confirmation", "otp", "token"],
      default: "password_confirmation",
    },
    verifiedAt: { type: Date, default: null },
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "failed"],
      default: "pending",
    },
  },
  { _id: false },
);

// ─── Agreement version sub-schema ─────────────────────────────────────────────
const agreementVersionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    documentHash: { type: String, required: true },
    pdfChecksum: { type: String, required: true },
    cloudinary: {
      publicId: { type: String },
      secureUrl: { type: String },
      resourceType: { type: String, default: "raw" },
      format: { type: String, default: "pdf" },
      bytes: { type: Number },
    },
    generatedAt: { type: Date, default: Date.now },
    archivedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    generationTrigger: {
      type: String,
      enum: ["lease_created", "lease_updated", "manual_regeneration"],
      default: "lease_created",
    },
  },
  { _id: false },
);

// ─── Main RentalAgreement schema ──────────────────────────────────────────────
const rentalAgreementSchema = new mongoose.Schema(
  {
    // Single FK to lease — everything else populated through lease
    lease: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lease",
      required: true,
      unique: true,
    },

    agreementReference: {
      type: String,
      unique: true,
      required: true,
    },

    agreementType: {
      type: String,
      enum: ["Monthly", "Biannually", "Annually"],
      required: true,
    },

    // Current active version number
    currentVersion: {
      type: Number,
      default: 1,
    },

    // All versions — previous ones are archived
    versions: {
      type: [agreementVersionSchema],
      default: [],
    },

    // Current document (mirrors the active version for convenience)
    document: {
      publicId: { type: String, default: null },
      secureUrl: { type: String, default: null },
      documentHash: { type: String, default: null },
      pdfChecksum: { type: String, default: null },
      generatedAt: { type: Date, default: null },
    },

    // Signatures
    tenantSignature: {
      type: signatureSchema,
      default: () => ({}),
    },
    landlordSignature: {
      type: signatureSchema,
      default: () => ({}),
    },

    // Simplified status
    status: {
      type: String,
      enum: ["Pending", "Partially Signed", "Completed", "Void"],
      default: "Pending",
    },

    // Locking
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },

    // Idempotency — prevents duplicate signing requests
    signingNonces: {
      type: [String],
      default: [],
      select: false,
    },
  },
  { timestamps: true },
);

// ─── Virtual: get active version document ─────────────────────────────────────
rentalAgreementSchema.virtual("activeVersion").get(function () {
  return this.versions.find((v) => v.isActive) || null;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
rentalAgreementSchema.index({ lease: 1 });
rentalAgreementSchema.index({ agreementReference: 1 });
rentalAgreementSchema.index({ status: 1 });

module.exports = mongoose.model("RentalAgreement", rentalAgreementSchema);
