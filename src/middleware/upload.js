const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

/**
 * Factory that returns a multer middleware uploading to a specific Cloudinary folder.
 * Usage:
 *   upload('rentsafe/profiles')   → for user profile photos
 *   upload('rentsafe/tenants')    → for tenant profile photos
 *   upload('rentsafe/documents')  → for documents
 */
const upload = (folder = "rentsafe/misc") => {
  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder,
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
      ],
    },
  });

  return multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new ApiError(400, "Only image files are allowed"), false);
      }
    },
  });
};

module.exports = upload;
