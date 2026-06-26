const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("express-async-errors");

const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.json({ success: true, message: "RentSafe API is live ✅" });
});

// Routes will be mounted here as we build each module
// Routes
// Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/properties", require("./routes/property.routes"));
app.use("/api/properties/:propertyId/units", require("./routes/unit.routes"));
app.use("/api/units", require("./routes/unit.routes"));

app.use((req, res) => {
  res
    .status(404)
    .json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

app.use(errorHandler);

module.exports = app;
