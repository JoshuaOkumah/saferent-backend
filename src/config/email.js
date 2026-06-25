const nodemailer = require("nodemailer");

console.log("EMAIL_USER =", process.env.EMAIL_USER);
console.log("EMAIL_PASS =", process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
  service: "gmail", // swap for SendGrid/Brevo in production
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail app password, not your account password
  },
});

module.exports = transporter;
