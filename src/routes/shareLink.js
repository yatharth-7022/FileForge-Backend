const express = require("express");

const { authenticateToken } = require("../middleware/auth");
const {
  createShareLink,
  getPublicSharedFile,
  updateShareLink,
  verifyPassword,
  downloadSharedFile,
} = require("../controllers/shareLinkController");

const router = express.Router();

router.post("/create-share-link/:fileId", authenticateToken, createShareLink);
router.get("/:shareToken", getPublicSharedFile);
router.put("/update/:shareId", authenticateToken, updateShareLink);
router.post("/:shareToken/verify-password", verifyPassword);
router.get("/:shareToken/download", downloadSharedFile);

module.exports = router;
