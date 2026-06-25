const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const bankAccountSchema = new mongoose.Schema(
  {
    bankName: { type: String },
    accountNumber: { type: String },
    accountName: { type: String },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
    },
    password: {
      type: String,
      default: null, // null for Google users
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ["landlord", "tenant", "admin"],
      default: "landlord",
    },
    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    bankAccount: {
      type: bankAccountSchema,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Email verification OTP
    emailVerificationOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    emailVerificationExpiry: {
      type: Date,
      default: null,
    },
    // Password reset OTP
    passwordResetOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiry: {
      type: Date,
      default: null,
    },
    // Account lockout after repeated failed logins
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Hash password before save — skip if not modified or if Google user
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare plain password to hashed
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Check if account is currently locked
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

module.exports = mongoose.model("User", userSchema);
