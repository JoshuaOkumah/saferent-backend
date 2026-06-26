const { body } = require("express-validator");

const createUnitRules = [
  body("unitNumber").trim().notEmpty().withMessage("Unit number is required"),
  body("unitType")
    .notEmpty()
    .withMessage("Unit type is required")
    .isIn([
      "Single Room",
      "Self Contain",
      "1 Bedroom",
      "2 Bedroom",
      "3 Bedroom",
      "Shop",
      "Office",
    ])
    .withMessage("Invalid unit type"),
  body("rentAmount")
    .notEmpty()
    .withMessage("Rent amount is required")
    .isFloat({ min: 0 })
    .withMessage("Rent amount cannot be negative"),
  body("serviceCharge")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Service charge cannot be negative"),
  body("securityDeposit")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Security deposit cannot be negative"),
];

const bulkCreateUnitRules = [
  body("units")
    .isArray({ min: 1 })
    .withMessage("Units must be a non-empty array"),
  body("units.*.unitNumber")
    .trim()
    .notEmpty()
    .withMessage("Each unit must have a unit number"),
  body("units.*.unitType")
    .notEmpty()
    .withMessage("Each unit must have a unit type")
    .isIn([
      "Single Room",
      "Self Contain",
      "1 Bedroom",
      "2 Bedroom",
      "3 Bedroom",
      "Shop",
      "Office",
    ])
    .withMessage("Invalid unit type in bulk list"),
  body("units.*.rentAmount")
    .notEmpty()
    .withMessage("Each unit must have a rent amount")
    .isFloat({ min: 0 })
    .withMessage("Rent amount cannot be negative"),
];

const updateUnitRules = [
  body("rentAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Rent amount cannot be negative"),
  body("status")
    .optional()
    .isIn(["Vacant", "Occupied", "Reserved", "Under Maintenance"])
    .withMessage("Invalid unit status"),
  body("unitType")
    .optional()
    .isIn([
      "Single Room",
      "Self Contain",
      "1 Bedroom",
      "2 Bedroom",
      "3 Bedroom",
      "Shop",
      "Office",
    ])
    .withMessage("Invalid unit type"),
];

module.exports = { createUnitRules, bulkCreateUnitRules, updateUnitRules };
