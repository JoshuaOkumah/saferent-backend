const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const cloudinary = require("../config/cloudinary");
const validatePassword = require("../utils/validatePassword");

// ─── Helper: clean user shape ─────────────────────────────────────────────────
const sanitizeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  provider: user.provider,
  isVerified: user.isVerified,
  accountStatus: user.accountStatus,
  profilePhoto: user.profilePhoto,
  bankAccount: user.bankAccount,
  address: user.address,
  createdAt: user.createdAt,
});

// ─── GET /api/profile ─────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  res.status(200).json({
    success: true,
    data: sanitizeUser(user),
  });
};

// ─── PUT /api/profile ─────────────────────────────────────────────────────────
// Landlord updates their own profile — name, phone, address
const updateProfile = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  // Whitelist — only these fields can be self-updated
  const allowedFields = ["name", "phone", "address"];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  Object.assign(user, updates);
  await user.save();

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: sanitizeUser(user),
  });
};

// ─── PATCH /api/profile/photo ─────────────────────────────────────────────────
// Upload or replace profile photo — works for both landlord and tenant User accounts
const updateProfilePhoto = async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "Please upload an image file");
  }

  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  // Delete old photo from Cloudinary if one exists
  if (user.profilePhoto?.publicId) {
    try {
      await cloudinary.uploader.destroy(user.profilePhoto.publicId);
    } catch (err) {
      // Non-fatal — old image may already be gone
      console.error("Failed to delete old profile photo:", err.message);
    }
  }

  // multer-storage-cloudinary already uploaded the file — grab the result
  user.profilePhoto = {
    publicId: req.file.filename,
    secureUrl: req.file.path,
  };

  await user.save();

  res.status(200).json({
    success: true,
    message: "Profile photo updated successfully",
    data: {
      profilePhoto: user.profilePhoto,
    },
  });
};

// ─── DELETE /api/profile/photo ────────────────────────────────────────────────
const deleteProfilePhoto = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  if (!user.profilePhoto?.publicId) {
    throw new ApiError(400, "No profile photo to delete");
  }

  // Remove from Cloudinary
  await cloudinary.uploader.destroy(user.profilePhoto.publicId);

  user.profilePhoto = { publicId: null, secureUrl: null };
  await user.save();

  res.status(200).json({
    success: true,
    message: "Profile photo removed successfully",
  });
};

// ─── PATCH /api/profile/bank-account ─────────────────────────────────────────
// Landlord sets or updates their bank account for Paystack manual payouts
const updateBankAccount = async (req, res) => {
  const { bankName, accountNumber, accountName } = req.body;

  if (!bankName || !accountNumber || !accountName) {
    throw new ApiError(
      400,
      "Bank name, account number, and account name are all required",
    );
  }

  // Basic Nigerian account number validation — must be exactly 10 digits
  if (!/^\d{10}$/.test(accountNumber)) {
    throw new ApiError(400, "Account number must be exactly 10 digits");
  }

  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  if (user.role !== "landlord" && user.role !== "admin") {
    throw new ApiError(403, "Only landlords can add bank account details");
  }

  user.bankAccount = { bankName, accountNumber, accountName };
  await user.save();

  res.status(200).json({
    success: true,
    message: "Bank account details saved successfully",
    data: { bankAccount: user.bankAccount },
  });
};

// ─── DELETE /api/profile/bank-account ────────────────────────────────────────
const deleteBankAccount = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, "User not found");

  if (!user.bankAccount?.accountNumber) {
    throw new ApiError(400, "No bank account details to remove");
  }

  user.bankAccount = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Bank account details removed successfully",
  });
};

// ─── PATCH /api/profile/change-password ──────────────────────────────────────
// For logged-in landlords who want to change their password from settings
const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new ApiError(
      400,
      "Current password, new password, and confirm password are required",
    );
  }

  if (newPassword !== confirmPassword) {
    throw new ApiError(400, "Passwords do not match");
  }

  if (currentPassword === newPassword) {
    throw new ApiError(
      400,
      "New password must be different from your current password",
    );
  }

  validatePassword(newPassword);

  const user = await User.findById(req.user.id).select("+password");
  if (!user) throw new ApiError(404, "User not found");

  if (user.provider === "google") {
    throw new ApiError(
      400,
      "Your account uses Google sign-in and has no password to change",
    );
  }

  if (!user.password) {
    throw new ApiError(400, "No password set on this account");
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(401, "Current password is incorrect");

  user.password = newPassword; // pre-save hook hashes it
  await user.save();

  res.status(200).json({
    success: true,
    message: "Password changed successfully",
  });
};

module.exports = {
  getProfile,
  updateProfile,
  updateProfilePhoto,
  deleteProfilePhoto,
  updateBankAccount,
  deleteBankAccount,
  changePassword,
};
