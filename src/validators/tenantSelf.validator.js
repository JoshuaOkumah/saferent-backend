const { body } = require("express-validator");

// Fields a tenant is allowed to update on themselves
const tenantSelfUpdateRules = [
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
  body("phone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Phone number cannot be empty"),
  body("alternatePhone").optional().trim(),
  body("gender")
    .optional()
    .isIn(["Male", "Female", "Other", "Prefer not to say"])
    .withMessage("Invalid gender value"),
  body("dateOfBirth")
    .optional()
    .isISO8601()
    .withMessage("Date of birth must be a valid date (YYYY-MM-DD)")
    .custom((val) => {
      const dob = new Date(val);
      const minAge = new Date();
      minAge.setFullYear(minAge.getFullYear() - 18);
      if (dob > minAge) throw new Error("You must be at least 18 years old");
      return true;
    }),
  body("nationality")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Nationality cannot be empty"),
  body("occupation").optional().trim(),
  body("employer").optional().trim(),
  body("workAddress").optional().trim(),
  body("emergencyContact.name").optional().trim(),
  body("emergencyContact.phone").optional().trim(),
  body("emergencyContact.relationship").optional().trim(),
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
  body("governmentIdNumber").optional().trim(),

  // Block any fields tenants are not allowed to touch
  body("notes").not().exists().withMessage("You are not allowed to edit notes"),
  body("internalNotes")
    .not()
    .exists()
    .withMessage("You are not allowed to edit internal notes"),
  body("status")
    .not()
    .exists()
    .withMessage("You are not allowed to change your status"),
  body("owner").not().exists().withMessage("Not allowed"),
  body("userAccount").not().exists().withMessage("Not allowed"),
  body("createdBy").not().exists().withMessage("Not allowed"),
];

const tenantPasswordChangeRules = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword").notEmpty().withMessage("New password is required"),
  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((val, { req }) => {
      if (val !== req.body.newPassword)
        throw new Error("Passwords do not match");
      return true;
    }),
];

module.exports = { tenantSelfUpdateRules, tenantPasswordChangeRules };
