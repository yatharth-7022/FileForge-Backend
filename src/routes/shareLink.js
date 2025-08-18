const express = require("express");

const { authenticateToken } = require("../middleware/auth");
const {
  createShareLink,
  getPublicSharedFile,
} = require("../controllers/shareLinkController");

const router = express.Router();

router.post("/create-share-link/:fileId", authenticateToken, createShareLink);
router.get("/:shareToken", getPublicSharedFile);

module.exports = router;
