const express = require("express");
const router = express.Router();

const {
  createLease,
  getLeases,
  getLeaseById,
  terminateLease,
  renewLease,
  cancelLease,
  getExpiringLeases,
} = require("../controllers/lease.controller");

const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");
const validate = require("../middleware/validate");
const {
  createLeaseRules,
  renewLeaseRules,
  terminateLeaseRules,
} = require("../validators/lease.validator");

router.use(protect, restrictTo("landlord", "admin"));

router.get("/expiring", getExpiringLeases);

router.route("/").post(createLeaseRules, validate, createLease).get(getLeases);

router.route("/:id").get(getLeaseById);

router.post("/:id/renew", renewLeaseRules, validate, renewLease);
router.patch("/:id/terminate", terminateLeaseRules, validate, terminateLease);
router.patch("/:id/cancel", cancelLease);

module.exports = router;
