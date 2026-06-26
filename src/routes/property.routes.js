const express = require("express");
const router = express.Router();

const {
  createProperty,
  getProperties,
  getPropertyById,
  updateProperty,
  archiveProperty,
} = require("../controllers/property.controller");

const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");
const validate = require("../middleware/validate");
const {
  createPropertyRules,
  updatePropertyRules,
  listPropertyRules,
} = require("../validators/property.validator");

router.use(protect, restrictTo("landlord", "admin"));

router
  .route("/")
  .post(createPropertyRules, validate, createProperty)
  .get(listPropertyRules, validate, getProperties);

router
  .route("/:id")
  .get(getPropertyById)
  .put(updatePropertyRules, validate, updateProperty)
  .delete(archiveProperty);

module.exports = router;
