const express = require("express");
const router = express.Router();

const {
  onboardNewTenant,
  activateAccount,
  resendInvitation,
  cancelInvitation,
  getMyTenantDashboard,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  getTenants,
  getTenantById,
  updateTenant,
  archiveTenant,
} = require("../controllers/tenant.controller");

const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");
const validate = require("../middleware/validate");

const {
  createTenantRules,
  updateTenantRules,
  listTenantRules,
} = require("../validators/tenant.validator");
const {
  tenantSelfUpdateRules,
  tenantPasswordChangeRules,
} = require("../validators/tenantSelf.validator");

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/activate", activateAccount);

// ── Tenant-only ───────────────────────────────────────────────────────────────
router.get("/me", protect, restrictTo("tenant"), getMyTenantDashboard);
router.get("/me/profile", protect, restrictTo("tenant"), getMyProfile);
router.patch(
  "/me/profile",
  protect,
  restrictTo("tenant"),
  tenantSelfUpdateRules,
  validate,
  updateMyProfile,
);
router.patch(
  "/me/password",
  protect,
  restrictTo("tenant"),
  tenantPasswordChangeRules,
  validate,
  changeMyPassword,
);

// ── Landlord-only ─────────────────────────────────────────────────────────────
router.use(protect, restrictTo("landlord", "admin"));

router.post("/onboard", createTenantRules, validate, onboardNewTenant);

router.route("/").get(listTenantRules, validate, getTenants);

router
  .route("/:id")
  .get(getTenantById)
  .put(updateTenantRules, validate, updateTenant)
  .delete(archiveTenant);

router.post("/:id/resend-invite", resendInvitation);
router.patch("/:id/cancel-invite", cancelInvitation);

module.exports = router;
