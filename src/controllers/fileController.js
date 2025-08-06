const { PrismaClient } = require("../generated/prisma");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");
const mime = require("mime-types"); // Add this dependency: npm install mime-types
const { sign } = require("crypto");
const axios = require("axios"); // Add this at the top of fileController.js if not already
const { REFUSED } = require("dns");

const prisma = new PrismaClient();

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        // type: "private",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const bufferStream = Readable.from(buffer);
    bufferStream.pipe(stream);
  });
};

const uploadFile = async (req, res) => {
  try {
    console.log("Upload request received:", {
      file: req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            buffer: req.file.buffer ? "Buffer present" : "Buffer missing",
          }
        : "No file in request",
    });

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ message: "File buffer is empty" });
    }

    console.log("Attempting to upload to Cloudinary...");
    const cloudinaryResponse = await uploadToCloudinary(req.file.buffer);

    // Improved format extraction using mime-types
    const format =
      mime.extension(req.file.mimetype) ||
      req.file.mimetype.split("/")[1] ||
      "unknown";

    const file = await prisma.file.create({
      data: {
        name: req.file.originalname,
        url: cloudinaryResponse.secure_url,
        format: format,
        publicId: cloudinaryResponse.public_id,
        size: req.file.size,
        ownerId: req.user.userId,
      },
    });
    res.status(200).json({
      message: "File uploaded successfully",
      file: {
        id: file.id,
        name: file.name,
        format: file.format,
        size: file.size,
        url: file.url,
      },
    });
  } catch (error) {
    console.error("File upload error:", error);
    res.status(500).json({ message: "Error uploading file" });
  }
};

const getAllFiles = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 10);
    const searchQuery = req.query.search;
    const fileType = req.query.file_type;

    const skip = (page - 1) * limit;

    const whereClause = {
      ownerId: userId,
      isDeleted: false,
      ...(fileType && { format: fileType }),
      ...(searchQuery && {
        name: {
          contains: searchQuery,
          mode: "insensitive",
        },
      }),
    };

    const totalFiles = await prisma.file.count({
      where: whereClause,
    });

    const files = await prisma.file.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        url: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        format: true,
        size: true,
      },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      message: "Files retrieved successfully", // Fixed typo: "Filed" -> "Files"
      data: {
        files,
        pagination: {
          currentPage: page,
          totalPages,
          totalFiles,
          hasNextPage,
          hasPrevPage,
          limit,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching files", error);
    if (error.name === "ValidationError") {
      // Fixed: == to ===
      return res.status(400).json({
        message: "Invalid query parameters",
        details: error.message,
      });
    }
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

const deleteFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const fileId = req.params.fileId;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerId: userId,
      },
    });
    if (!file) {
      return res.status(400).json({
        message: "File not found or you don't have permission",
      });
    }
    try {
      await cloudinary.uploader.destroy(file.publicId);
    } catch (cloudinaryError) {
      console.error("Error deleting file", cloudinaryError);
      return res.status(500).json({
        message: "Error deleting file from storage",
      });
    }
    await prisma.file.delete({
      where: {
        id: fileId,
      },
    });
    res.json({
      message: "File deleted successfully",
      fileId: fileId,
    });
  } catch (error) {
    console.error("File deletion error:", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

const softDeleteFiles = async (req, res) => {
  try {
    const userId = req.user.userId;
    const fileId = req.params.fileId;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerId: userId,
        isDeleted: false,
      },
    });

    if (!file) {
      return res.status(404).json({
        message: "File not found or you don't have appropriate permission",
      });
    }

    const updatedFile = await prisma.file.update({
      where: {
        id: fileId,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deleteById: userId,
      },
    });

    res.status(200).json({
      message: "File moved to trash",
      file: {
        id: updatedFile.id,
        name: updatedFile.name,
        deletedAt: updatedFile.deletedAt,
      },
    });
  } catch (error) {
    console.error("Soft delete error:", error);
    res.status(500).json({
      message: "Error moving file to trash",
    });
  }
};

const viewTrashFiles = async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalTrashFiles = await prisma.file.count({
      where: {
        isDeleted: true,
        ownerId: userId,
      },
    });

    const trashFiles = await prisma.file.findMany({
      where: {
        isDeleted: true,
        ownerId: userId,
      },
      orderBy: {
        deletedAt: "desc",
      },
      select: {
        id: true,
        deletedAt: true,
        format: true,
        ownerId: true,
        url: true,
        name: true,
        size: true,
        deletedBy: {
          select: {
            name: true,
          },
        },
      },
      skip,
      take: limit,
    });
    if (!trashFiles || trashFiles.length === 0) {
      // Improved check
      return res.status(404).json({
        // Changed to 404 for "not found"
        message: "No trash files found",
      });
    }
    const totalPages = Math.ceil(totalTrashFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      message: "Files retrieved successfully",
      data: {
        trashFiles,
        pagination: {
          currentPage: page,
          totalPages,
          totalFiles: totalTrashFiles,
          hasNextPage,
          hasPrevPage,
          limit,
        },
      },
    });
  } catch (error) {
    console.error("Could not fetch trash files,", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};

const downloadFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const fileId = req.params.fileId;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerId: userId,
        isDeleted: false,
      },
    });

    if (!file) {
      return res.status(404).json({
        message: "File not found or you don't have permission to download",
      });
    }

    // Log for debugging
    console.log("File details for download:", {
      publicId: file.publicId,
      format: file.format,
      name: file.name,
    });

    // Generate signed URL params for private download
    const timestamp = Math.floor(Date.now() / 1000); // Current time in seconds
    const expiresIn = timestamp + 3600; // Expires in 1 hour
    const paramsToSign = {
      public_id: file.publicId, // No extension
      timestamp: timestamp,
      expires_at: expiresIn,
      resource_type: "raw",
      // type: "private",
    };

    // Sign the request with Cloudinary API secret
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      cloudinary.config().api_secret
    );

    // Build the signed URL with attachment flag to force download
    const signedUrl = cloudinary.utils.private_download_url(
      file.publicId,
      file.format,
      {
        resource_type: "raw",
        type: "private",
        expires_at: expiresIn,
        attachment: true,
      }
    );

    // Log the URL for debugging
    console.log("Generated signed Cloudinary URL:", signedUrl);

    // Redirect to the signed URL for direct download
    res.redirect(302, signedUrl);
  } catch (error) {
    console.error("Download error details:", {
      message: error.message,
      stack: error.stack,
    });

    if (!res.headersSent) {
      res.status(500).json({
        message: "Error processing download request",
        details: error.message,
      });
    }
  }
};

const viewFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const fileId = req.params.fileId;

    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerId: userId,
        isDeleted: false,
      },
    });
    if (!file) {
      return res.status(400).json({
        message: "File not found or you don't have permission to view",
      });
    }

    // Log for debugging
    console.log("File details for view:", {
      publicId: file.publicId,
      format: file.format,
      name: file.name,
    });

    // Generate signed URL for internal fetch (using private_download_url for secure access)
    const timestamp = Math.floor(Date.now() / 1000); // Current time in seconds
    const expiresAt = timestamp + 3600; // Expires in 1 hour

    const signedUrl = cloudinary.utils.private_download_url(
      file.publicId,
      file.format,
      {
        resource_type: "raw",
        type: "private",
        expires_at: expiresAt,
        attachment: false, // Attempt inline, but we'll override with headers
      }
    );

    // Log the internal signed URL for debugging
    console.log(
      "Generated internal signed Cloudinary URL for view:",
      signedUrl
    );

    // Fetch the file from Cloudinary using the signed URL
    const response = await axios({
      method: "get",
      url: signedUrl,
      responseType: "stream", // Stream the response to avoid loading in memory
    });

    // Set headers for inline viewing
    res.setHeader("Content-Disposition", `inline; filename="${file.name}"`); // Inline to render in tab
    const mimeType = mime.lookup(file.format) || "application/octet-stream"; // Use mime-types for accuracy
    res.setHeader("Content-Type", mimeType);

    // Stream the file content to the client
    response.data.pipe(res);

    // Handle stream errors
    response.data.on("error", (err) => {
      console.error("Stream error during view:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error streaming file for viewing" });
      }
    });
  } catch (error) {
    console.error("View error details:", {
      message: error.message,
      stack: error.stack,
    });
    if (!res.headersSent) {
      res.status(500).json({
        message: "Error generating view",
        details: error.message,
      });
    }
  }
};
const renameFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const fileId = req.params.fileId;
    if (!req.body && typeof req.body !== "object") {
      return res.status(400).json({
        message: "Request body is missing or invalid",
      });
    }
    const { name } = req.body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({
        message: "Enter a valid name",
      });
    }

    const existingFile = await prisma.file.findUnique({
      where: {
        id: fileId,
        ownerId: userId,
      },
    });
    if (!existingFile) {
      return res.status(400).json({
        message: "File not found or unauthorized",
      });
    }

    const file = await prisma.file.update({
      where: {
        id: fileId,
      },
      data: {
        name: name,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return res.status(200).json({
      message: "File renamed successfully",
      data: file,
    });
  } catch (error) {
    console.error("Could not rename file ", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
};
const getPdfThumbnail = async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const userId = req.user.userId;

    // Get the file details from the database
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerId: userId,
        isDeleted: false,
      },
    });
    if (!file) {
      return res.status(400).json({
        message: "File not found",
      });
    }
    if (file.format.toLowerCase() !== "pdf") {
      return res.status(400).json({
        message: "File is not a pdf",
      });
    }

    const thumbnailUrl = cloudinary.url(file.publicId, {
      // No .jpg here
      resource_type: "image", // Treat as image for transformations
      transformation: [
        {
          width: 300,
          crop: "fill",
          page: 1,
          quality: "auto",
          fetch_format: "auto",
        },
      ],
      format: "jpg", // Output as JPG
      secure: true, // HTTPS
      // No sign_url, expires_at, or type: "private" — for public access
    });

    // Log for debugging
    console.log("Generated thumbnail URL:", thumbnailUrl);

    res.status(200).json({
      thumbnailUrl,
      originalName: file.name,
      format: file.format,
    });
  } catch (error) {
    console.error("PDF thumbnail generation error:", error);
    res.status(500).json({ message: "Error generating PDF thumbnail" });
  }
};

module.exports = {
  uploadFile,
  getAllFiles,
  deleteFile,
  softDeleteFiles,
  viewTrashFiles,
  downloadFile,
  viewFile,
  renameFile,
  getPdfThumbnail,
};
