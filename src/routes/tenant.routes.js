const express = require("express");
const router = express.Router();

const {
  createTenant,
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

router.use(protect, restrictTo("landlord", "admin"));

router
  .route("/")
  .post(createTenantRules, validate, createTenant)
  .get(listTenantRules, validate, getTenants);

router
  .route("/:id")
  .get(getTenantById)
  .put(updateTenantRules, validate, updateTenant)
  .delete(archiveTenant);

module.exports = router;
