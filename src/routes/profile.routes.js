const express = require("express");
const router = express.Router();

const {
  getProfile,
  updateProfile,
  updateProfilePhoto,
  deleteProfilePhoto,
  updateBankAccount,
  deleteBankAccount,
  changePassword,
} = require("../controllers/profile.controller");

const protect = require("../middleware/protect");
const validate = require("../middleware/validate");
const upload = require("../middleware/upload");
const {
  updateProfileRules,
  bankAccountRules,
  changePasswordRules,
} = require("../validators/profile.validator");

// All profile routes require authentication
router.use(protect);

// Profile
router.get("/", getProfile);
router.put("/", updateProfileRules, validate, updateProfile);

// Profile photo
router.patch(
  "/photo",
  upload("rentsafe/profiles").single("photo"),
  updateProfilePhoto,
);
router.delete("/photo", deleteProfilePhoto);

// Bank account (landlord only — enforced in controller)
router.patch("/bank-account", bankAccountRules, validate, updateBankAccount);
router.delete("/bank-account", deleteBankAccount);

// Password change (in-app, requires current password — NOT the forgot password flow)
router.patch("/change-password", changePasswordRules, validate, changePassword);

module.exports = router;
