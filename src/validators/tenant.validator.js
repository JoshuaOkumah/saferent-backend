const { body, query } = require("express-validator");

const createTenantRules = [
  body("firstName").trim().notEmpty().withMessage("First name is required"),
  body("lastName").trim().notEmpty().withMessage("Last name is required"),
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
  body("phone").trim().notEmpty().withMessage("Phone number is required"),
  body("dateOfBirth")
    .optional()
    .isISO8601()
    .withMessage("Date of birth must be a valid date (YYYY-MM-DD)")
    .custom((val) => {
      const dob = new Date(val);
      const minAge = new Date();
      minAge.setFullYear(minAge.getFullYear() - 18);
      if (dob > minAge) throw new Error("Tenant must be at least 18 years old");
      return true;
    }),
  body("gender")
    .optional()
    .isIn(["Male", "Female", "Other", "Prefer not to say"])
    .withMessage("Invalid gender value"),
  body("governmentIdType")
    .optional()
    .isIn([
      "Passport",
      "Driver's Licence",
      "National ID",
      "Residence Permit",
      "Other",
    ])
    .withMessage("Invalid government ID type"),
  body("emergencyContact.phone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Emergency contact phone cannot be empty if provided"),
];

const updateTenantRules = [
  body("firstName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("First name cannot be empty"),
  body("lastName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Last name cannot be empty"),
  body("email")
    .optional()
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),
  body("dateOfBirth")
    .optional()
    .isISO8601()
    .withMessage("Date of birth must be a valid date (YYYY-MM-DD)"),
  body("status")
    .optional()
    .isIn(["Active", "Former", "Blacklisted", "Archived"])
    .withMessage("Invalid tenant status"),
];

const listTenantRules = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("status")
    .optional()
    .isIn(["Active", "Former", "Blacklisted", "Archived"])
    .withMessage("Invalid status filter"),
];

module.exports = { createTenantRules, updateTenantRules, listTenantRules };
