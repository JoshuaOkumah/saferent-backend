const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("express-async-errors");

const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(morgan("dev"));
app.use(express.json());

// Routes (we'll add as we build)
app.use("/api/auth", require("./routes/auth.routes"));

app.get("/", (req, res) => res.json({ message: "RentSafe API live ✅" }));

app.use(errorHandler);

module.exports = app;
