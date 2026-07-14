const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("express-async-errors");

const errorHandler = require("./middleware/errorHandler");
const sanitizeBody = require("./middleware/sanitize");
const { globalLimiter } = require("./middleware/rateLimiter");

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);

// ─── Global rate limiter ──────────────────────────────────────────────────────
app.use(globalLimiter);

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "tiny"));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─── Input sanitization ───────────────────────────────────────────────────────
app.use(sanitizeBody);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ success: true, message: "RentSafe API is live ✅" });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/profile", require("./routes/profile.routes"));
app.use("/api/properties", require("./routes/property.routes"));
app.use("/api/properties/:propertyId/units", require("./routes/unit.routes"));
app.use("/api/units", require("./routes/unit.routes"));
app.use("/api/tenants", require("./routes/tenant.routes"));
app.use("/api/leases", require("./routes/lease.routes"));
app.use("/api/agreements", require("./routes/agreement.routes"));

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
