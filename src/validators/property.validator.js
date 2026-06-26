const { body, query } = require("express-validator");

const createPropertyRules = [
  body("name").trim().notEmpty().withMessage("Property name is required"),
  body("propertyType")
    .notEmpty()
    .withMessage("Property type is required")
    .isIn([
      "Apartment",
      "Duplex",
      "Block of Flats",
      "Estate",
      "Commercial Building",
      "Office Space",
      "Shop Complex",
    ])
    .withMessage("Invalid property type"),
  body("address").trim().notEmpty().withMessage("Address is required"),
  body("city").trim().notEmpty().withMessage("City is required"),
  body("state").trim().notEmpty().withMessage("State is required"),
];

const updatePropertyRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Property name cannot be empty"),
  body("propertyType")
    .optional()
    .isIn([
      "Apartment",
      "Duplex",
      "Block of Flats",
      "Estate",
      "Commercial Building",
      "Office Space",
      "Shop Complex",
    ])
    .withMessage("Invalid property type"),
  body("status")
    .optional()
    .isIn(["Active", "Inactive", "Archived"])
    .withMessage("Invalid status"),
];

const listPropertyRules = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
];

module.exports = {
  createPropertyRules,
  updatePropertyRules,
  listPropertyRules,
};
