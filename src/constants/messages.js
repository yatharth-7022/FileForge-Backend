/**
 * Centralized messages for consistent error and success responses across the application
 * This file contains all common messages used in controllers to avoid repetition
 */

const MESSAGES = {
  // Generic Error Messages
  INTERNAL_SERVER_ERROR: "Internal server error",
  INVALID_REQUEST_BODY: "Request body is missing or invalid",
  INVALID_QUERY_PARAMETERS: "Invalid query parameters",
  UNAUTHORIZED_ACCESS: "You don't have permission to access this resource",

  // Authentication Messages
  USER_ALREADY_EXISTS: "User already exists",
  USER_REGISTERED_SUCCESS: "User registered successfully",
  LOGIN_SUCCESS: "Login successful",
  INVALID_CREDENTIALS: "Invalid credentials",
  INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
  USER_DETAILS_NOT_FOUND: "User details not found",
  USER_DATA_RETRIEVED_SUCCESS: "User data retrieved successfully",

  // File Upload Messages
  NO_FILES_PROVIDED: "No files provided",
  FILE_UPLOADED_SUCCESS: "File uploaded successfully",
  FILE_UPLOAD_FAILED: "File upload failed",
  INVALID_FILE_BUFFER: "Invalid file buffer",
  ERROR_UPLOADING_FILES: "Error uploading files",

  // File Management Messages
  FILES_RETRIEVED_SUCCESS: "Files retrieved successfully",
  FILE_NOT_FOUND: "File not found",
  FILE_NOT_FOUND_OR_NO_PERMISSION:
    "File not found or you don't have permission",
  FILE_NOT_FOUND_OR_UNAUTHORIZED: "File not found or unauthorized",
  FILE_NOT_FOUND_OR_ALREADY_DELETED: "File not found or already deleted",
  FILE_FAVORITED_SUCCESS: "File favorited successfully",
  FILE_UNFAVORITED_SUCCESS: "File unfavorited successfully",
  FILE_DELETED_SUCCESS: "File deleted successfully",
  FILE_MOVED_TO_TRASH: "File moved to trash",
  FILE_RESTORED_SUCCESS: "File restored successfully",
  FILE_PERMANENTLY_DELETED: "File permanently deleted",
  FILE_RENAMED_SUCCESS: "File renamed successfully",

  // File Access Messages
  NO_PERMISSION_TO_DOWNLOAD:
    "File not found or you don't have permission to download",
  NO_PERMISSION_TO_VIEW: "File not found or you don't have permission to view",
  MISSING_UPLOADCARE_UUID: "File has no Uploadcare publicId (UUID) stored",
  INVALID_UPLOADCARE_UUID: "Invalid Uploadcare UUID format in publicId",

  // File Type Specific Messages
  NO_IMAGE_FILES_FOUND: "No image files found",
  IMAGE_FILES_RETRIEVED_SUCCESS: "Image files retrieved successfully",
  FILE_IS_NOT_PDF: "File is not a PDF",
  PDF_THUMBNAIL_GENERATED: "PDF thumbnail generated",

  // Trash/Deletion Messages
  NO_TRASH_FILES_FOUND: "No trash files found",
  NO_FILE_IDS_PROVIDED: "No file IDs provided",
  COULD_NOT_PROCESS_REQUEST: "Could not process request",
  FILE_NOT_FOUND_IN_TRASH:
    "File not found in trash or you don't have permission",

  // Storage/External Service Messages
  ERROR_DELETING_FROM_STORAGE: "Error deleting file from storage",
  ERROR_PROCESSING_DOWNLOAD: "Error processing download request",
  ERROR_STREAMING_FILE: "Error streaming file for viewing",
  ERROR_GENERATING_VIEW: "Error generating view",
  ERROR_GENERATING_PDF_THUMBNAIL: "Error generating PDF thumbnail",
  UPLOADCARE_API_ERROR: "Uploadcare convert API error",
  UNEXPECTED_CONVERSION_RESPONSE: "Unexpected conversion response",
  CONVERSION_FINISHED_WITHOUT_UUID: "Conversion finished without result UUID",

  // Validation Messages
  ENTER_VALID_NAME: "Enter a valid name",

  // Conversion/Processing Messages
  NO_CONVERSION_TOKEN_RECEIVED: "No conversion token received",
  NO_THUMBNAIL_UUID_RECEIVED: "No thumbnail UUID received",
  DOCUMENT_CONVERSION_FAILED: "Document conversion failed",
  DOCUMENT_CONVERSION_TIMED_OUT: "Document conversion timed out",
  SOURCE_FILE_NOT_READY: "Source file not ready in time",

  // Success Messages with Dynamic Content
  processedFilesMessage: (count) => `Processed ${count} files`,
  processedFilesWithSummary: (total, successful, failed) =>
    `Processed ${total} files - ${successful} successful, ${failed} failed`,
};

module.exports = MESSAGES;
