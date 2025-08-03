const express = require("express");
require("dotenv").config();
const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const app = express();

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
