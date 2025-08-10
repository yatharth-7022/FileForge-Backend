const express = require("express");
const {
  uploadFiles,
  getAllFiles,
  deleteFile,
  softDeleteFiles,
  viewTrashFiles,
  downloadFile,
  viewFile,
  renameFile,
  getPdfThumbnail,
  permanentDelete,
  restoreFile,
  getImageFiles,
  toggleStarFile,
} = require("../controllers/fileController");
const { authenticateToken } = require("../middleware/auth");
const fileUpload = require("../middleware/fileUpload");

const router = express.Router();
// Unified upload endpoint that handles both single and multiple files
// Usage:
// - Single file: POST /upload with form field 'files' containing one file
// - Multiple files: POST /upload with form field 'files' containing multiple files
// - Returns single file format for 1 file, multiple files format for 2+ files
router.post(
  "/upload",
  authenticateToken,
  ...fileUpload.array("files", 10), // This middleware can handle both single files and arrays
  uploadFiles
);
router.patch("/rename-file/:fileId", authenticateToken, renameFile);
router.get("/get-files", authenticateToken, getAllFiles);
router.delete("/delete-file/:fileId", authenticateToken, deleteFile);
router.get("/download/:fileId", authenticateToken, downloadFile);
router.get("/view-file/:fileId", authenticateToken, viewFile);

router.put("/soft-delete", authenticateToken, softDeleteFiles);
router.get("/trash", authenticateToken, viewTrashFiles);
router.get("/pdf-thumbnail/:fileId", authenticateToken, getPdfThumbnail);
router.delete("/trash/permanent/:fileId", authenticateToken, permanentDelete);
router.put("/restore/:fileId", authenticateToken, restoreFile);
router.patch("/files/:fileId/toggle-star", authenticateToken, toggleStarFile);
router.get("/get-image-files", authenticateToken, getImageFiles);

module.exports = router;
