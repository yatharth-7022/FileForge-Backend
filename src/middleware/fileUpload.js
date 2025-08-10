// src/middleware/fileUpload.js
const multer = require("multer");

const ALLOWED_FILE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/heif-sequence": "heif-sequence",
  "image/heic-sequence": "heic-sequence",
  "image/heif-sequence": "heif-sequence",
  "image/heic-sequence": "heic-sequence",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/tab-separated-values": "tsv",
  "text/tab-separated-values": "tsv",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "pptx",
};
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  console.log("Received file:", {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
  });

  if (ALLOWED_FILE_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
};
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: fileFilter,
});

const handleFileUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          message: `File size too large. Max file size allowed is ${MAX_FILE_SIZE}`,
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          message: "Unexpected fields in form data",
        });
      default: {
        return res.status(400).json({
          message: "Error uploading file",
        });
      }
    }
  } else if (err) {
    return res.status(400).json({
      message: err.message,
    });
  }
  next();
};

const fileUpload = {
  single: (fieldName) => {
    return [upload.single(fieldName), handleFileUploadError];
  },
  array: (fieldName, maxCount) => {
    return [upload.array(fieldName, maxCount), handleFileUploadError];
  },
};

module.exports = fileUpload;
