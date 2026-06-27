const mongoose = require("mongoose");

const tenantInvitationSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    // The User account created for this tenant
    userAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Expired", "Cancelled"],
      default: "Pending",
    },
    // Context for the invitation email
    propertyName: { type: String },
    unitNumber: { type: String },
    landlordName: { type: String },
  },
  { timestamps: true },
);

tenantInvitationSchema.index({ tenant: 1 });
tenantInvitationSchema.index({ userAccount: 1 });
tenantInvitationSchema.index({ email: 1, status: 1 });
tenantInvitationSchema.index({ expiresAt: 1 }); // for cleanup jobs later

module.exports = mongoose.model("TenantInvitation", tenantInvitationSchema);
