const express = require("express");
const {
  uploadFile,
  getAllFiles,
  deleteFile,
  softDeleteFiles,
  viewTrashFiles,
  downloadFile,
  viewFile,
  renameFile,
  getPdfThumbnail,
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
router.patch("/rename-file/:fileId", authenticateToken, renameFile);
router.get("/get-files", authenticateToken, getAllFiles);
router.delete("/delete-file/:fileId", authenticateToken, deleteFile);
router.get("/download/:fileId", authenticateToken, downloadFile);
router.get("/view-file/:fileId", authenticateToken, viewFile);

router.put("/soft-delete/:fileId", authenticateToken, softDeleteFiles);
router.get("/trash", authenticateToken, viewTrashFiles);
router.get("/pdf-thumbnail/:fileId", authenticateToken, getPdfThumbnail);

module.exports = router;
