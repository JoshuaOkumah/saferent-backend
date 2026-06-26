const mongoose = require("mongoose");

const leaseDocumentSchema = new mongoose.Schema(
  {
    publicId: { type: String },
    secureUrl: { type: String, required: true },
    name: { type: String, required: true },
    docType: {
      type: String,
      enum: [
        "Signed Agreement",
        "Terms",
        "Inventory Checklist",
        "Inspection Report",
        "Other",
      ],
      default: "Other",
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const leaseSchema = new mongoose.Schema(
  {
    leaseNumber: {
      type: String,
      unique: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startDate: {
      type: Date,
      required: [true, "Lease start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "Lease end date is required"],
    },
    rentAmount: {
      type: Number,
      required: [true, "Rent amount is required"],
      min: [0, "Rent amount cannot be negative"],
    },
    securityDeposit: {
      type: Number,
      default: 0,
      min: [0, "Security deposit cannot be negative"],
    },
    serviceCharge: {
      type: Number,
      default: 0,
      min: [0, "Service charge cannot be negative"],
    },
    paymentFrequency: {
      type: String,
      enum: ["Monthly", "Quarterly", "Biannually", "Annually"],
      default: "Monthly",
    },
    rentDueDay: {
      type: Number,
      min: [1, "Rent due day must be between 1 and 28"],
      max: [28, "Rent due day must be between 1 and 28"], // cap at 28 to avoid month-end issues
      default: 1,
    },
    gracePeriod: {
      type: Number, // in days
      default: 7,
      min: [0, "Grace period cannot be negative"],
    },
    noticePeriod: {
      type: Number, // in days
      default: 30,
      min: [0, "Notice period cannot be negative"],
    },
    currency: {
      type: String,
      default: "NGN",
    },
    renewalOption: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: [
        "Draft",
        "Pending",
        "Active",
        "Expired",
        "Terminated",
        "Cancelled",
        "Renewed",
      ],
      default: "Active",
    },
    // If this lease was renewed, point to the new lease
    renewedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lease",
      default: null,
    },
    // If this lease is a renewal, point to the old lease
    renewedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lease",
      default: null,
    },
    terminatedAt: {
      type: Date,
      default: null,
    },
    terminationReason: {
      type: String,
      trim: true,
      default: null,
    },
    documents: {
      type: [leaseDocumentSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
leaseSchema.index({ landlord: 1, status: 1 });
leaseSchema.index({ unit: 1, status: 1 });
leaseSchema.index({ tenant: 1 });
leaseSchema.index({ endDate: 1, status: 1 }); // for expiry jobs

module.exports = mongoose.model("Lease", leaseSchema);
