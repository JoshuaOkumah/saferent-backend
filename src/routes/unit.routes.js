const express = require("express");
const router = express.Router({ mergeParams: true }); // mergeParams for propertyId

const {
  createUnit,
  bulkCreateUnits,
  getUnits,
  getUnitById,
  updateUnit,
  updateUnitStatus,
  archiveUnit,
  transferTenant,
} = require("../controllers/unit.controller");

const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");
const validate = require("../middleware/validate");
const {
  createUnitRules,
  bulkCreateUnitRules,
  updateUnitRules,
} = require("../validators/unit.validator");

router.use(protect, restrictTo("landlord", "admin"));

// Nested under /api/properties/:propertyId/units
router.route("/").get(getUnits).post(createUnitRules, validate, createUnit);

router.post("/bulk", bulkCreateUnitRules, validate, bulkCreateUnits);

// Standalone unit routes under /api/units/:id
router
  .route("/:id")
  .get(getUnitById)
  .put(updateUnitRules, validate, updateUnit)
  .delete(archiveUnit);

router.patch("/:id/status", updateUnitStatus);
router.patch("/:id/transfer", transferTenant);

module.exports = router;
