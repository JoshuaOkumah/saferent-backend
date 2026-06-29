const { body } = require("express-validator");

const updateProfileRules = [
  body("name")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Name cannot be empty")
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("phone")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Phone number cannot be empty"),
  body("address").optional().trim(),
];

const bankAccountRules = [
  body("bankName").trim().notEmpty().withMessage("Bank name is required"),
  body("accountNumber")
    .trim()
    .notEmpty()
    .withMessage("Account number is required")
    .matches(/^\d{10}$/)
    .withMessage("Account number must be exactly 10 digits"),
  body("accountName").trim().notEmpty().withMessage("Account name is required"),
];

const changePasswordRules = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),
  body("newPassword").notEmpty().withMessage("New password is required"),
  body("confirmPassword")
    .notEmpty()
    .withMessage("Confirm password is required")
    .custom((val, { req }) => {
      if (val !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
];

module.exports = { updateProfileRules, bankAccountRules, changePasswordRules };
