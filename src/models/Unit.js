const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Property",
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // denormalized for fast authorization checks
    },
    unitNumber: {
      type: String,
      required: [true, "Unit number is required"],
      trim: true,
    },
    unitType: {
      type: String,
      enum: [
        "Single Room",
        "Self Contain",
        "1 Bedroom",
        "2 Bedroom",
        "3 Bedroom",
        "Shop",
        "Office",
      ],
      required: [true, "Unit type is required"],
    },
    bedrooms: {
      type: Number,
      default: 0,
      min: [0, "Bedrooms cannot be negative"],
    },
    bathrooms: {
      type: Number,
      default: 0,
      min: [0, "Bathrooms cannot be negative"],
    },
    rentAmount: {
      type: Number,
      required: [true, "Rent amount is required"],
      min: [0, "Rent amount cannot be negative"],
    },
    serviceCharge: {
      type: Number,
      default: 0,
      min: [0, "Service charge cannot be negative"],
    },
    securityDeposit: {
      type: Number,
      default: 0,
      min: [0, "Security deposit cannot be negative"],
    },
    status: {
      type: String,
      enum: ["Vacant", "Occupied", "Reserved", "Under Maintenance"],
      default: "Vacant",
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// ─── Compound index: unit numbers must be unique per property ─────────────────
unitSchema.index({ property: 1, unitNumber: 1 }, { unique: true });
unitSchema.index({ owner: 1 });
unitSchema.index({ property: 1, status: 1 });

module.exports = mongoose.model("Unit", unitSchema);
