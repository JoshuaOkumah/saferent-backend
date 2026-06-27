const { body, query } = require("express-validator");

const createTenantRules = [
  // ── Tenant fields ──────────────────────────────────────────────────────────
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

  // ── Property + Unit ────────────────────────────────────────────────────────
  body("propertyId")
    .notEmpty()
    .withMessage("Property ID is required")
    .isMongoId()
    .withMessage("Invalid property ID"),
  body("unitId")
    .notEmpty()
    .withMessage("Unit ID is required")
    .isMongoId()
    .withMessage("Invalid unit ID"),

  // ── Lease fields ───────────────────────────────────────────────────────────
  body("startDate")
    .notEmpty()
    .withMessage("Lease start date is required")
    .isISO8601()
    .withMessage("Start date must be a valid date (YYYY-MM-DD)"),
  body("endDate")
    .notEmpty()
    .withMessage("Lease end date is required")
    .isISO8601()
    .withMessage("End date must be a valid date (YYYY-MM-DD)")
    .custom((endDate, { req }) => {
      if (!req.body.startDate) return true; // startDate error already caught above
      if (new Date(endDate) <= new Date(req.body.startDate)) {
        throw new Error("End date must be after start date");
      }
      return true;
    }),
  body("rentAmount")
    .notEmpty()
    .withMessage("Rent amount is required")
    .isFloat({ min: 0 })
    .withMessage("Rent amount cannot be negative"),
  body("securityDeposit")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Security deposit cannot be negative"),
  body("serviceCharge")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Service charge cannot be negative"),
  body("paymentFrequency")
    .optional()
    .isIn(["Monthly", "Quarterly", "Biannually", "Annually"])
    .withMessage("Invalid payment frequency"),
  body("rentDueDay")
    .optional()
    .isInt({ min: 1, max: 28 })
    .withMessage("Rent due day must be between 1 and 28"),
  body("gracePeriod")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Grace period cannot be negative"),
  body("noticePeriod")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Notice period cannot be negative"),
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
    .isIn(["Active", "Former", "Blacklisted", "Archived", "Pending Activation"])
    .withMessage("Invalid status filter"),
];

module.exports = { createTenantRules, updateTenantRules, listTenantRules };
