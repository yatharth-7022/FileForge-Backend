const express = require("express");
const {
  uploadFile,
  getAllFiles,
  deleteFile,
  softDeleteFiles,
} = require("../controllers/fileController");
const { authenticateToken } = require("../middleware/auth");
const fileUpload = require("../middleware/fileUpload");

const router = express.Router();
router.post(
  "/upload-file",
  authenticateToken,
  fileUpload.single("file"),
  uploadFile
);
router.get("/get-files", authenticateToken, getAllFiles);
router.delete("/delete-file/:fileId", authenticateToken, deleteFile);
router.put("/files/:fileId/trash", authenticateToken, softDeleteFiles);
module.exports = router;
