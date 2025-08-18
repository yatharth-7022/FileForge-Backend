const express = require("express");
require("dotenv").config();
const cors = require("cors");
const logger = require("./config/logger");
const requestLogger = require("./middleware/requestLogger");
const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const shareLinkRoutes = require("./routes/shareLink");
const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",")
  : ["http://localhost:3000"];
// CORS Configuration
app.use(
  cors({
    origin: allowedOrigins, // Allow your frontend URL
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], // Include PATCH for rename endpoint
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
  })
);

const PORT = 5000;
app.use(express.json());
app.use(requestLogger);
app.get("/health", (req, res) => {
  logger.info("Health check endpoint called", {
    timestamp: new Date().toISOString(),
    ip: req.ip,
  });
  res.json({
    message: "Welcome to my backend",
  });
});
app.use("/api/auth", authRoutes);
app.use("/api", uploadRoutes);
app.use("/api/share", shareLinkRoutes);

// Error handling middleware should be last
const errorHandler = require("./middleware/errorHandler");
app.use(errorHandler);

app
  .listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  })
  .on("error", (err) => {
    logger.error("Server failed to start:", err);
  });
