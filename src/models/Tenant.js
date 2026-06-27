const mongoose = require("mongoose");

const emergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    relationship: { type: String, trim: true },
  },
  { _id: false },
);

const guarantorSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    relationship: { type: String, trim: true },
  },
  { _id: false },
);

const tenantDocumentSchema = new mongoose.Schema(
  {
    publicId: { type: String },
    secureUrl: { type: String, required: true },
    name: { type: String, required: true },
    docType: {
      type: String,
      enum: [
        "Passport",
        "ID",
        "Proof of Employment",
        "Utility Bill",
        "Guarantor Letter",
        "Other",
      ],
      default: "Other",
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const tenantSchema = new mongoose.Schema(
  {
    // Which landlord created this tenant
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // The User account created for this tenant (set after invitation is accepted)
    userAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    alternatePhone: {
      type: String,
      trim: true,
      default: null,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    nationality: {
      type: String,
      trim: true,
      default: "Nigerian",
    },
    occupation: {
      type: String,
      trim: true,
      default: null,
    },
    employer: {
      type: String,
      trim: true,
      default: null,
    },
    workAddress: {
      type: String,
      trim: true,
      default: null,
    },
    emergencyContact: {
      type: emergencyContactSchema,
      default: null,
    },
    guarantor: {
      type: guarantorSchema,
      default: null,
    },
    governmentIdType: {
      type: String,
      enum: [
        "Passport",
        "Driver's Licence",
        "National ID",
        "Residence Permit",
        "Other",
        null,
      ],
      default: null,
    },
    governmentIdNumber: {
      type: String,
      trim: true,
      default: null,
    },
    profilePhoto: {
      publicId: { type: String, default: null },
      secureUrl: { type: String, default: null },
    },
    documents: {
      type: [tenantDocumentSchema],
      default: [],
    },
    // Visible to both tenant and landlord
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    // Landlord-only internal comments — never exposed to tenant
    internalNotes: {
      type: String,
      trim: true,
      default: null,
      select: true, // we'll manually strip this from tenant-facing responses
    },
    status: {
      type: String,
      enum: [
        "Active",
        "Former",
        "Blacklisted",
        "Archived",
        "Pending Activation",
      ],
      default: "Pending Activation", // until invite is accepted
    },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Duplicate email under same landlord is not allowed
tenantSchema.index({ owner: 1, email: 1 }, { unique: true });
tenantSchema.index({ owner: 1, status: 1 });
tenantSchema.index({ owner: 1, phone: 1 });

module.exports = mongoose.model("Tenant", tenantSchema);
