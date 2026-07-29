const crypto = require("crypto");
const AgreementAudit = require("../models/AgreementAudit");

/**
 * Create an immutable audit event.
 * Never throws — audit failures must never crash the main flow.
 */
const createAuditEvent = async (
  {
    agreement,
    agreementReference,
    event,
    actor = null,
    actorRole = "system",
    actorEmail = null,
    actorName = null,
    ipAddress = null,
    userAgent = null,
    agreementVersion = null,
    documentHash = null,
    metadata = {},
  },
  session = null,
) => {
  try {
    const eventId = `AUD-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
    const opts = session ? { session } : {};

    const created = await AgreementAudit.create(
      [
        {
          eventId,
          agreement,
          agreementReference,
          event,
          actor,
          actorRole,
          actorEmail,
          actorName,
          ipAddress,
          userAgent,
          agreementVersion,
          documentHash,
          metadata,
        },
      ],
      opts,
    );

    console.log(
      "[AuditTrail] Created event:",
      event,
      "for agreement:",
      agreement?.toString(),
    );
  } catch (err) {
    console.error(
      "[AuditTrail] FAILED to create audit event:",
      event,
      "-",
      err.message,
    );
    if (err.errors) {
      console.error(
        "[AuditTrail] Validation errors:",
        JSON.stringify(err.errors, null, 2),
      );
    }
  }
};

module.exports = { createAuditEvent };
