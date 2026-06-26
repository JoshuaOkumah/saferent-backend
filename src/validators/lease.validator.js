const { body } = require("express-validator");

const createLeaseRules = [
  body("tenantId")
    .notEmpty()
    .withMessage("Tenant ID is required")
    .isMongoId()
    .withMessage("Invalid tenant ID"),
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
  body("startDate")
    .notEmpty()
    .withMessage("Start date is required")
    .isISO8601()
    .withMessage("Start date must be a valid date"),
  body("endDate")
    .notEmpty()
    .withMessage("End date is required")
    .isISO8601()
    .withMessage("End date must be a valid date")
    .custom((endDate, { req }) => {
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

const renewLeaseRules = [
  body("startDate")
    .notEmpty()
    .withMessage("New lease start date is required")
    .isISO8601()
    .withMessage("Start date must be a valid date"),
  body("endDate")
    .notEmpty()
    .withMessage("New lease end date is required")
    .isISO8601()
    .withMessage("End date must be a valid date")
    .custom((endDate, { req }) => {
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
];

const terminateLeaseRules = [body("reason").optional().trim()];

module.exports = { createLeaseRules, renewLeaseRules, terminateLeaseRules };
