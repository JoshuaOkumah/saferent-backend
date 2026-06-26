const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    secureUrl: { type: String, required: true },
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    publicId: { type: String },
    secureUrl: { type: String, required: true },
    name: { type: String, required: true },
    docType: {
      type: String,
      enum: [
        "Deed",
        "Survey Plan",
        "Allocation Letter",
        "Building Approval",
        "Other",
      ],
      default: "Other",
    },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const propertySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Property name is required"],
      trim: true,
    },
    propertyType: {
      type: String,
      enum: [
        "Apartment",
        "Duplex",
        "Block of Flats",
        "Estate",
        "Commercial Building",
        "Office Space",
        "Shop Complex",
      ],
      required: [true, "Property type is required"],
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },
    country: {
      type: String,
      default: "Nigeria",
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    amenities: {
      type: [String],
      default: [],
    },
    images: {
      type: [imageSchema],
      default: [],
    },
    documents: {
      type: [documentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Archived"],
      default: "Active",
    },
  },
  { timestamps: true },
);

// ─── Virtual: compute unit stats dynamically ──────────────────────────────────
// These are calculated from the Unit collection, not stored
// Used when you .populate() or call the dashboard endpoint
propertySchema.virtual("units", {
  ref: "Unit",
  localField: "_id",
  foreignField: "property",
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
propertySchema.index({ owner: 1 });
propertySchema.index({ owner: 1, status: 1 });
propertySchema.index({ name: "text", city: "text", state: "text" });

module.exports = mongoose.model("Property", propertySchema);
