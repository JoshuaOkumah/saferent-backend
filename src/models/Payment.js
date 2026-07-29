const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    lease: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lease",
      required: true,
      index: true,
    },
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    month: {
      type: Number,
      required: true,
      min: [1, "Month must be between 1 and 12"],
      max: [12, "Month must be between 1 and 12"],
    },
    year: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "paid",
        "failed",
        "cancelled",
        "expired",
        "refunded",
      ],
      default: "pending",
      index: true,
    },
    paymentProvider: {
      type: String,
      enum: ["BACHS"],
      default: "BACHS",
    },
    paymentMethod: {
      type: String,
      enum: ["card", "bank_transfer", "wallet", "unknown"],
      default: "unknown",
    },
    transactionReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    bachsTransactionId: {
      type: String,
      sparse: true,
      index: true,
    },
    checkoutId: {
      type: String,
      sparse: true,
    },
    checkoutUrl: {
      type: String,
      default: null,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    webhookProcessedAt: {
      type: Date,
      default: null,
    },
    // Idempotency — tracks every webhook event ID already processed
    processedWebhookEventIds: {
      type: [String],
      default: [],
      select: false,
    },
    // Audit — retry count for checkout creation attempts
    checkoutAttempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// ─── Compound index — one payment per lease per month per year (guarded in app logic too) ──
paymentSchema.index({ lease: 1, month: 1, year: 1, status: 1 });
paymentSchema.index({ tenant: 1, status: 1 });
paymentSchema.index({ landlord: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Payment", paymentSchema);
