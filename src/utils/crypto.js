const crypto = require("crypto");

/**
 * SHA-256 hash of a buffer or string.
 * Used for document integrity verification.
 */
const sha256 = (data) => {
  return crypto.createHash("sha256").update(data).digest("hex");
};

/**
 * Generate a cryptographically secure signature hash.
 * Combines signerId + documentHash + timestamp + random bytes.
 * NOT Date.now() tokens — proper HMAC-based construction.
 */
const generateSignatureHash = (signerId, documentHash, role) => {
  const secret = process.env.SIGNATURE_HMAC_SECRET || process.env.JWT_SECRET;
  const payload = `${role}:${signerId}:${documentHash}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

/**
 * Generate a unique signature ID.
 * Format: RSD-L-XXXXXXXX (landlord) or RSD-T-XXXXXXXX (tenant)
 * Uses random bytes — collision probability negligible.
 */
const generateSignatureId = (role) => {
  const prefix = role === "landlord" ? "RSD-L" : "RSD-T";
  const unique = crypto.randomBytes(8).toString("hex").toUpperCase();
  return `${prefix}-${unique}`;
};

/**
 * Generate a unique agreement reference.
 * Format: RS-AGR-2026-000001
 */
const generateAgreementReference = async (AgreementModel) => {
  const year = new Date().getFullYear();
  const prefix = `RS-AGR-${year}-`;

  const latest = await AgreementModel.findOne(
    { agreementReference: new RegExp(`^${prefix}`) },
    { agreementReference: 1 },
    { sort: { agreementReference: -1 } },
  );

  let nextNumber = 1;
  if (latest) {
    const parts = latest.agreementReference.split("-");
    nextNumber = parseInt(parts[3], 10) + 1;
  }

  return `${prefix}${String(nextNumber).padStart(6, "0")}`;
};

/**
 * Format a date as "1st day of July 2026"
 */
const formatDateLong = (date) => {
  const d = new Date(date);
  const day = d.getDate();
  const suffix = ["th", "st", "nd", "rd"][
    day % 10 <= 3 && Math.floor(day / 10) !== 1 ? day % 10 : 0
  ];
  const month = d.toLocaleString("en-NG", { month: "long" });
  const year = d.getFullYear();
  return `${day}${suffix} day of ${month} ${year}`;
};

/**
 * Format a date as "1st July 2026"
 */
const formatDateShort = (date) => {
  const d = new Date(date);
  const day = d.getDate();
  const suffix = ["th", "st", "nd", "rd"][
    day % 10 <= 3 && Math.floor(day / 10) !== 1 ? day % 10 : 0
  ];
  const month = d.toLocaleString("en-NG", { month: "long" });
  const year = d.getFullYear();
  return `${day}${suffix} ${month} ${year}`;
};

module.exports = {
  sha256,
  generateSignatureHash,
  generateSignatureId,
  generateAgreementReference,
  formatDateLong,
  formatDateShort,
};
