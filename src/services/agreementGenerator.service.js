const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execSync } = require("child_process");
const cloudinary = require("../config/cloudinary");
const { toNairaWords } = require("../utils/numberToWords");
const { sha256, formatDateLong, formatDateShort } = require("../utils/crypto");

// ─── Template paths — shipped with the RentSafe backend ──────────────────────
const TEMPLATES = {
  Monthly: path.join(__dirname, "../templates/monthly.docx"),
  Biannually: path.join(__dirname, "../templates/biannual.docx"),
  Annually: path.join(__dirname, "../templates/annual.docx"),
};

/**
 * Select the correct template based on payment frequency.
 * Monthly → monthly.docx
 * Quarterly / Biannually → biannual.docx
 * Annually → annual.docx
 */
const selectTemplate = (paymentFrequency) => {
  if (paymentFrequency === "Monthly") return TEMPLATES.Monthly;
  if (paymentFrequency === "Biannually" || paymentFrequency === "Quarterly")
    return TEMPLATES.Biannually;
  if (paymentFrequency === "Annually") return TEMPLATES.Annually;
  return TEMPLATES.Annually; // safe default
};

/**
 * Determine agreement type label from payment frequency.
 */
const getAgreementType = (paymentFrequency) => {
  if (paymentFrequency === "Monthly") return "Monthly";
  if (paymentFrequency === "Biannually" || paymentFrequency === "Quarterly")
    return "Biannually";
  return "Annually";
};

/**
 * Build the complete placeholder map from lease + related data.
 * Every blank in the templates is represented here.
 */
const buildPlaceholders = ({
  lease,
  landlord,
  tenant,
  property,
  unit,
  agreementReference,
}) => {
  const startDate = new Date(lease.startDate);
  const endDate = new Date(lease.endDate);

  // Monthly instalment amount
  const monthlyAmount =
    lease.paymentFrequency === "Monthly"
      ? lease.rentAmount
      : lease.paymentFrequency === "Biannually"
        ? lease.rentAmount / 2
        : lease.rentAmount;

  // Bi-annual instalment dates
  const firstInstalment = formatDateShort(startDate);
  const secondInstalmentDate = new Date(startDate);
  secondInstalmentDate.setMonth(secondInstalmentDate.getMonth() + 6);
  const secondInstalment = formatDateShort(secondInstalmentDate);

  return {
    // Agreement meta
    "{{agreementReference}}": agreementReference,
    "{{agreementDate}}": formatDateLong(new Date()),
    "{{agreementDateDay}}": startDate.getDate().toString(),
    "{{agreementDateMonth}}": startDate.toLocaleString("en-NG", {
      month: "long",
    }),
    "{{agreementDateYear}}": startDate.getFullYear().toString().slice(-2),

    // Landlord
    "{{landlordName}}": landlord.name || "",
    "{{landlordAddress}}": landlord.address || "",
    "{{landlordPhone}}": landlord.phone || "",
    "{{landlordNIN}}": "", // not stored — left intentionally blank
    "{{rentSafeLandlordId}}": landlord._id.toString(),

    // Tenant
    "{{tenantName}}": `${tenant.firstName} ${tenant.lastName}`,
    "{{tenantAddress}}": tenant.workAddress || "",
    "{{tenantPhone}}": tenant.phone || "",
    "{{tenantNIN}}": tenant.governmentIdNumber || "",
    "{{rentSafeTenantId}}": tenant._id.toString(),

    // Property
    "{{propertyName}}": property.name || "",
    "{{propertyAddress}}": `${property.address}, ${property.city}, ${property.state}`,
    "{{rentSafePropertyId}}": property._id.toString(),

    // Unit
    "{{unitNumber}}": unit.unitNumber || "",

    // Lease dates
    "{{startDate}}": formatDateShort(startDate),
    "{{startDateLong}}": formatDateLong(startDate),
    "{{startDateDay}}": startDate.getDate().toString(),
    "{{startDateMonth}}": startDate.toLocaleString("en-NG", { month: "long" }),
    "{{startDateYear}}": startDate.getFullYear().toString().slice(-2),
    "{{endDate}}": formatDateShort(endDate),
    "{{endDateLong}}": formatDateLong(endDate),
    "{{endDateDay}}": endDate.getDate().toString(),
    "{{endDateMonth}}": endDate.toLocaleString("en-NG", { month: "long" }),
    "{{endDateYear}}": endDate.getFullYear().toString().slice(-2),

    // Financial
    "{{rentAmount}}": `₦${lease.rentAmount.toLocaleString("en-NG")}`,
    "{{rentAmountInWords}}": toNairaWords(lease.rentAmount),
    "{{monthlyAmount}}": `₦${monthlyAmount.toLocaleString("en-NG")}`,
    "{{monthlyAmountInWords}}": toNairaWords(monthlyAmount),
    "{{securityDeposit}}": lease.securityDeposit
      ? `₦${lease.securityDeposit.toLocaleString("en-NG")}`
      : "N/A",
    "{{serviceCharge}}": lease.serviceCharge
      ? `₦${lease.serviceCharge.toLocaleString("en-NG")}`
      : "N/A",
    "{{rentDueDay}}": lease.rentDueDay.toString(),
    "{{gracePeriodDays}}": lease.gracePeriod.toString(),
    "{{noticePeriodDays}}": lease.noticePeriod.toString(),

    // Bi-annual specific
    "{{firstInstalmentDate}}": firstInstalment,
    "{{secondInstalmentDate}}": secondInstalment,
    "{{instalmentAmount}}": `₦${monthlyAmount.toLocaleString("en-NG")}`,
    "{{instalmentAmountInWords}}": toNairaWords(monthlyAmount),

    // State (extracted from property)
    "{{state}}": property.state || "",

    // Signature placeholders (filled at signing time, left blank in initial generation)
    "{{landlordSignatureId}}": "",
    "{{tenantSignatureId}}": "",
    "{{landlordSignedDate}}": "",
    "{{tenantSignedDate}}": "",
    "{{generatedDate}}": new Date().toLocaleString("en-NG", {
      dateStyle: "long",
      timeStyle: "short",
    }),
  };
};

/**
 * Read the docx XML, apply all placeholder replacements, return modified XML.
 * Handles the case where Word splits placeholder text across multiple <w:t> elements.
 */
const applyPlaceholders = (xml, placeholders) => {
  // First pass: replace {{placeholder}} style markers
  let result = xml;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    // Escape regex special chars in placeholder
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "g"), value);
  }

  // Second pass: replace the original document blanks
  // These are the ___ style blanks from the original templates
  result = result
    // Agreement date blanks
    .replace(
      /the ___ day of ________ 20__/g,
      `the ${placeholders["{{startDateDay}}"]} day of ${placeholders["{{startDateMonth}}"]} ${new Date(placeholders["{{startDate}}"] || Date.now()).getFullYear()}`,
    )
    // Commencement date blanks in body
    .replace(
      /shall commence on the ___ day of ________ 20__/g,
      `shall commence on the ${placeholders["{{startDateDay}}"]} day of ${placeholders["{{startDateMonth}}"]} ${new Date().getFullYear()}`,
    )
    .replace(
      /shall expire on the ___ day of ________ 20__/g,
      `shall expire on the ${placeholders["{{endDateDay}}"]} day of ${placeholders["{{endDateMonth}}"]} ${new Date().getFullYear() + 1}`,
    );

  // Replace landlord fields (______ style blanks in sequence)
  result = applySequentialBlanks(result, placeholders);

  return result;
};

/**
 * Replace sequential blank fields (______) using structured search.
 * More reliable than positional replacement — matches the XML run containing the blank.
 */
const applySequentialBlanks = (xml, placeholders) => {
  // Map of text patterns to their replacement values
  const textReplacements = [
    // These match the exact text content in <w:t> elements
    {
      pattern: /Name: _{10,}/g,
      replacement: `Name: ${placeholders["{{landlordName}}"]}`,
      limit: 1,
    },
    {
      pattern: /Address: _{10,}/g,
      replacement: `Address: ${placeholders["{{landlordAddress}}"]}`,
      limit: 1,
    },
    {
      pattern: /Phone Number: _{10,}/g,
      replacement: `Phone Number: ${placeholders["{{landlordPhone}}"]}`,
      limit: 2,
    },
    {
      pattern: /NIN: _{10,}/g,
      replacement: `NIN: ${placeholders["{{landlordNIN}}"]}`,
      limit: 2,
    },
    {
      pattern: /RentSafe Landlord ID: _{10,}/g,
      replacement: `RentSafe Landlord ID: ${placeholders["{{rentSafeLandlordId}}"]}`,
    },
    {
      pattern: /RentSafe Tenant ID: _{10,}/g,
      replacement: `RentSafe Tenant ID: ${placeholders["{{rentSafeTenantId}}"]}`,
    },
    {
      pattern: /RentSafe Property ID: _{10,}/g,
      replacement: `RentSafe Property ID: ${placeholders["{{rentSafePropertyId}}"]}`,
    },
    {
      pattern: /Property Address: _{10,}/g,
      replacement: `Property Address: ${placeholders["{{propertyAddress}}"]}`,
    },
    {
      pattern: /Unit Number \/ Description: _{10,}/g,
      replacement: `Unit Number / Description: ${placeholders["{{unitNumber}}"]}`,
    },
    {
      pattern: /RS-AGR-_{10,}/g,
      replacement: `${placeholders["{{agreementReference}}"]}`,
    },
    {
      pattern: /Generated: _{10,}/g,
      replacement: `Generated: ${placeholders["{{generatedDate}}"]}`,
    },
    {
      pattern: /RentSafe Agreement Reference: RS-AGR-_{10,}/g,
      replacement: `RentSafe Agreement Reference: ${placeholders["{{agreementReference}}"]}`,
    },
  ];

  let result = xml;
  for (const { pattern, replacement } of textReplacements) {
    result = result.replace(pattern, replacement);
  }

  // Replace remaining long blank sequences with empty or context-based values
  // ₦ amount blanks
  result = result
    .replace(/₦_{10,}/g, `₦${placeholders["{{rentAmount}}"].replace("₦", "")}`)
    .replace(
      /\(in words: _{10,} Naira only\)/g,
      `(in words: ${placeholders["{{rentAmountInWords}}"]})`,
    );

  return result;
};

/**
 * Main generation pipeline:
 * 1. Read template
 * 2. Unzip docx
 * 3. Apply placeholders to XML
 * 4. Repack docx
 * 5. Convert to PDF via LibreOffice
 * 6. Hash PDF
 * 7. Upload to Cloudinary
 * 8. Return metadata
 */
const generateAgreementPDF = async ({
  lease,
  landlord,
  tenant,
  property,
  unit,
  agreementReference,
}) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rentsafe-"));

  try {
    // ── 1. Select and copy template ───────────────────────────────────────
    const templatePath = selectTemplate(lease.paymentFrequency);
    const docxPath = path.join(tmpDir, "agreement.docx");
    fs.copyFileSync(templatePath, docxPath);

    // ── 2. Unzip docx ─────────────────────────────────────────────────────
    const xmlDir = path.join(tmpDir, "xml");
    fs.mkdirSync(xmlDir);
    execSync(`unzip -o "${docxPath}" -d "${xmlDir}"`, { stdio: "pipe" });

    // ── 3. Read and modify document.xml ───────────────────────────────────
    const documentXmlPath = path.join(xmlDir, "word", "document.xml");
    let xml = fs.readFileSync(documentXmlPath, "utf8");

    const placeholders = buildPlaceholders({
      lease,
      landlord,
      tenant,
      property,
      unit,
      agreementReference,
    });

    xml = applyPlaceholders(xml, placeholders);
    fs.writeFileSync(documentXmlPath, xml, "utf8");

    // ── 4. Repack docx ────────────────────────────────────────────────────
    const filledDocxPath = path.join(tmpDir, "filled.docx");
    fs.copyFileSync(docxPath, filledDocxPath);
    execSync(`cd "${xmlDir}" && zip -r "${filledDocxPath}" .`, {
      stdio: "pipe",
    });

    // ── 5. Convert to PDF via LibreOffice ─────────────────────────────────
    execSync(
      `libreoffice --headless --convert-to pdf --outdir "${tmpDir}" "${filledDocxPath}"`,
      { stdio: "pipe", timeout: 30000 },
    );

    const pdfPath = path.join(tmpDir, "filled.pdf");
    if (!fs.existsSync(pdfPath)) {
      throw new Error(
        "LibreOffice PDF conversion failed — output file not found",
      );
    }

    // ── 6. Hash the PDF ───────────────────────────────────────────────────
    const pdfBuffer = fs.readFileSync(pdfPath);
    const documentHash = sha256(pdfBuffer);
    const pdfChecksum = crypto
      .createHash("md5")
      .update(pdfBuffer)
      .digest("hex");

    // ── 7. Upload to Cloudinary ───────────────────────────────────────────
    const cloudinaryResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "raw",
            folder: "rentsafe/agreements",
            public_id: `${agreementReference}-v${Date.now()}`,
            format: "pdf",
            tags: ["agreement", lease.paymentFrequency.toLowerCase()],
          },
          (err, result) => {
            if (err) return reject(err);
            resolve(result);
          },
        )
        .end(pdfBuffer);
    });

    return {
      cloudinary: {
        publicId: cloudinaryResult.public_id,
        secureUrl: cloudinaryResult.secure_url,
        resourceType: cloudinaryResult.resource_type,
        format: cloudinaryResult.format,
        bytes: cloudinaryResult.bytes,
      },
      documentHash,
      pdfChecksum,
      generatedAt: new Date(),
      agreementType: getAgreementType(lease.paymentFrequency),
    };
  } finally {
    // ── 8. Always clean up temp files ─────────────────────────────────────
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-fatal
    }
  }
};

module.exports = {
  generateAgreementPDF,
  getAgreementType,
  selectTemplate,
};
