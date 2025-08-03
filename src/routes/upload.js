const express = require("express");
const {
  uploadFile,
  getAllFiles,
  deleteFile,
  softDeleteFiles,
  viewTrashFiles,
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
router.put("/soft-delete/:fileId", authenticateToken, softDeleteFiles);
router.get("/trash", authenticateToken, viewTrashFiles);
module.exports = router;
