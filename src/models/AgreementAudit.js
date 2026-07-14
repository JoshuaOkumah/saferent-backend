const mongoose = require("mongoose");

const agreementAuditSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    agreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RentalAgreement",
      required: true,
    },
    agreementReference: {
      type: String,
      required: true,
    },
    event: {
      type: String,
      required: true,
      enum: [
        "AGREEMENT_CREATED",
        "DOCUMENT_GENERATED",
        "DOCUMENT_UPLOADED",
        "DOCUMENT_DOWNLOADED",
        "DOCUMENT_VIEWED",
        "TENANT_STARTED_SIGNING",
        "TENANT_SIGNED",
        "LANDLORD_STARTED_SIGNING",
        "LANDLORD_SIGNED",
        "AGREEMENT_LOCKED",
        "LEASE_ACTIVATED",
        "AGREEMENT_VERSION_CREATED",
        "AGREEMENT_VERSION_ARCHIVED",
        "DOCUMENT_REGENERATED",
        "SIGNATURE_VERIFICATION_FAILED",
        "DOCUMENT_INTEGRITY_FAILED",
        "AGREEMENT_VOIDED",
      ],
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      default: null, // null for system events
    },
    actorRole: {
      type: String,
      enum: ["landlord", "tenant", "system", "admin"],
      default: "system",
    },
    actorEmail: { type: String, default: null },
    actorName: { type: String, default: null },

    // Network context
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },

    // Agreement context at time of event
    agreementVersion: { type: Number, default: null },
    documentHash: { type: String, default: null },

    // Arbitrary event metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    // Audit records are NEVER editable
  },
);

// Prevent any updates to audit records
agreementAuditSchema.pre("findOneAndUpdate", function () {
  throw new Error("AgreementAudit records are immutable");
});
agreementAuditSchema.pre("updateOne", function () {
  throw new Error("AgreementAudit records are immutable");
});
agreementAuditSchema.pre("updateMany", function () {
  throw new Error("AgreementAudit records are immutable");
});

agreementAuditSchema.index({ agreement: 1, createdAt: 1 });
agreementAuditSchema.index({ agreementReference: 1 });
agreementAuditSchema.index({ event: 1 });
agreementAuditSchema.index({ actor: 1 });

module.exports = mongoose.model("AgreementAudit", agreementAuditSchema);
