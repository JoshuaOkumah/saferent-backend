const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "PROPERTY_CREATED",
        "PROPERTY_UPDATED",
        "PROPERTY_ARCHIVED",
        "UNIT_CREATED",
        "UNIT_UPDATED",
        "UNIT_ARCHIVED",
        "TENANT_ASSIGNED",
        "TENANT_VACATED",
        "TENANT_TRANSFERRED",
        "LEASE_CREATED",
        "LEASE_ENDED",
        "PAYMENT_MADE",
        "MAINTENANCE_CREATED",
        "MAINTENANCE_UPDATED",
      ],
    },
    entity: {
      type: String, // 'Property' | 'Unit' | 'Tenant' | etc.
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed, // extra context — old value, new value, etc.
      default: {},
    },
  },
  { timestamps: true },
);

activityLogSchema.index({ actor: 1 });
activityLogSchema.index({ entityId: 1 });

module.exports = mongoose.model("ActivityLog", activityLogSchema);
