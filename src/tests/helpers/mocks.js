/**
 * Central mock setup for all external services.
 * Import this in test files that hit endpoints using external services.
 */

// ─── Mock nodemailer ──────────────────────────────────────────────────────────
jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: "test-message-id" }),
  }),
}));

// ─── Mock Cloudinary ──────────────────────────────────────────────────────────
jest.mock("../../../src/config/cloudinary.js", () => ({
  uploader: {
    upload_stream: jest.fn().mockImplementation((options, callback) => {
      // Return a writable stream mock
      const { Writable } = require("stream");
      const stream = new Writable({
        write(chunk, encoding, done) {
          done();
        },
      });
      stream.on("finish", () => {
        callback(null, {
          public_id: "rentsafe/test/mock-upload",
          secure_url: "https://res.cloudinary.com/test/mock-upload.pdf",
          resource_type: "raw",
          format: "pdf",
          bytes: 71514,
        });
      });
      // Trigger finish immediately
      process.nextTick(() => stream.emit("finish"));
      return stream;
    }),
    destroy: jest.fn().mockResolvedValue({ result: "ok" }),
  },
  config: jest.fn(),
}));

// ─── Mock agreement generator service ────────────────────────────────────────
jest.mock("../../../src/services/agreementGenerator.service.js", () => ({
  generateAgreementPDF: jest.fn().mockResolvedValue({
    cloudinary: {
      publicId: "rentsafe/agreements/mock-agreement",
      secureUrl: "https://res.cloudinary.com/test/mock-agreement.pdf",
      resourceType: "raw",
      format: "pdf",
      bytes: 71514,
    },
    documentHash:
      "mockhash123abc456def789ghi012jkl345mno678pqr901stu234vwx567yz",
    pdfChecksum: "mockchecksum123abc456def",
    generatedAt: new Date(),
    agreementType: "Annually",
  }),
  getAgreementType: jest.fn().mockReturnValue("Annually"),
  selectTemplate: jest.fn().mockReturnValue("/mock/template.docx"),
}));

// ─── Mock multer-storage-cloudinary ──────────────────────────────────────────
jest.mock("multer-storage-cloudinary", () => ({
  CloudinaryStorage: jest.fn().mockImplementation(() => ({
    _handleFile: jest.fn(),
    _removeFile: jest.fn(),
  })),
}));

// ─── Mock Google auth library ─────────────────────────────────────────────────
jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => ({
        email: "google@test.com",
        name: "Google User",
        picture: "https://example.com/photo.jpg",
      }),
    }),
  })),
}));

module.exports = {};
