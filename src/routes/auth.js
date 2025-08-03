const express = require("express");
const {
  register,
  login,
  getUserDetails,
} = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.post("/login", login);
router.post("/register", register);
router.get("/user", authenticateToken, getUserDetails);

module.exports = router;
