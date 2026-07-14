const express = require("express");
const router = express.Router();

const {
  getAgreement,
  getSigningStatus,
  tenantSign,
  landlordSign,
  getAuditTrail,
  getEvidencePackage,
} = require("../controllers/agreement.controller");

const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");

router.use(protect);

// Both landlord and tenant can view agreement and signing status
router.get("/:leaseId", getAgreement);
router.get("/:leaseId/status", getSigningStatus);

// Landlord only
router.patch(
  "/:leaseId/landlord-sign",
  restrictTo("landlord", "admin"),
  landlordSign,
);
router.get("/:leaseId/audit", restrictTo("landlord", "admin"), getAuditTrail);
router.get(
  "/:leaseId/evidence",
  restrictTo("landlord", "admin"),
  getEvidencePackage,
);

// Tenant only
router.patch("/:leaseId/tenant-sign", restrictTo("tenant"), tenantSign);

module.exports = router;
