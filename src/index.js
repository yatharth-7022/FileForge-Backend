const express = require("express");
require("dotenv").config();
const cors = require("cors");
const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const app = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(",")
  : ["http://localhost:3000"];
// CORS Configuration
app.use(
  cors({
    origin: allowedOrigins, // Allow your frontend URL
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
  })
);

const PORT = 5000;
app.use(express.json());
app.get("/health", (req, res) => {
  res.json({
    message: "Welcome to my backend",
  });
});
app.use("/api/auth", authRoutes);
app.use("/api", uploadRoutes);
app
  .listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  })
  .on("error", (err) => {
    console.error("Server failed to start:", err);
  });
