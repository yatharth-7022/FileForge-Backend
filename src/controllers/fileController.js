const { PrismaClient } = require("../generated/prisma");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");
const mime = require("mime-types"); // Add this dependency: npm install mime-types
const { sign } = require("crypto");
const axios = require("axios"); // Add this at the top of fileController.js if not already
const { REFUSED } = require("dns");
const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");

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

    console.log("Attempting to upload to Azure Blob Storage...");

    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    const containerClient = blobServiceClient.getContainerClient("files"); // Your container name
    const uniqueFileName = `${req.user.userId}/${Date.now()}-${
      req.file.originalname
    }`; // Unique path
    const blockBlobClient = containerClient.getBlockBlobClient(uniqueFileName);

    // Upload file to Azure
    await blockBlobClient.uploadData(req.file.buffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype },
    });

    // Improved format extraction
    const format =
      mime.extension(req.file.mimetype) ||
      req.file.mimetype.split("/")[1] ||
      "unknown";
    const cloudinaryResponse = await uploadToCloudinary(req.file.buffer);

    // Improved format extraction using mime-types

    const file = await prisma.file.create({
      data: {
        name: req.file.originalname,
        url: blockBlobClient.url,
        format: format,
        publicId: uniqueFileName, // Use as publicId for later reference
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
        publicId: true, // Added: Needed for SAS generation
      },
      skip,
      take: limit,
    });

    // Parse account details from connection string
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = connectionString.match(/AccountName=([^;]+)/)[1];
    const accountKey = connectionString.match(/AccountKey=([^;]+)/)[1];
    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    );

    // Generate signed URLs for each file
    const filesWithSignedUrls = files.map((file) => {
      const sasOptions = {
        permissions: BlobSASPermissions.parse("r"), // Read-only
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
      };
      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        sharedKeyCredential
      ).toString();
      const signedUrl = `${file.url}?${sasToken}`;

      return {
        ...file,
        url: signedUrl, // Replace raw URL with signed one
      };
    });

    const totalPages = Math.ceil(totalFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      message: "Files retrieved successfully",
      data: {
        files: filesWithSignedUrls, // Updated with signed URLs
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

    // Delete from Azure Blob Storage
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    const containerClient = blobServiceClient.getContainerClient("files");
    const blockBlobClient = containerClient.getBlockBlobClient(file.publicId);
    await blockBlobClient.deleteIfExists(); // Safe delete even if not found

    // Delete from Prisma
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
        publicId: true, // Added for SAS
      },
      skip,
      take: limit,
    });
    if (!trashFiles || trashFiles.length === 0) {
      return res.status(404).json({
        message: "No trash files found",
      });
    }

    // Parse account details from connection string
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = connectionString.match(/AccountName=([^;]+)/)[1];
    const accountKey = connectionString.match(/AccountKey=([^;]+)/)[1];
    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    );

    // Generate signed URLs
    const trashFilesWithSignedUrls = trashFiles.map((file) => {
      const sasOptions = {
        permissions: BlobSASPermissions.parse("r"),
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + 3600 * 1000),
      };
      const sasToken = generateBlobSASQueryParameters(
        sasOptions,
        sharedKeyCredential
      ).toString();
      const signedUrl = `${file.url}?${sasToken}`;

      return {
        ...file,
        url: signedUrl,
      };
    });

    const totalPages = Math.ceil(totalTrashFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      message: "Files retrieved successfully",
      data: {
        trashFiles: trashFilesWithSignedUrls,
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

    // Parse account details from connection string
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = connectionString.match(/AccountName=([^;]+)/)[1];
    const accountKey = connectionString.match(/AccountKey=([^;]+)/)[1];
    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    );

    // Full SAS options for blob-specific token
    const sasOptions = {
      containerName: "files", // Your container
      blobName: file.publicId, // The unique path from upload
      permissions: BlobSASPermissions.parse("r"), // Read-only
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
      protocol: "https", // Enforce HTTPS
      version: "2023-08-03", // Valid Azure service version
    };

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential
    ).toString();
    const signedUrl = `https://${accountName}.blob.core.windows.net/${sasOptions.containerName}/${sasOptions.blobName}?${sasToken}`;

    console.log("Generated SAS URL for download:", signedUrl); // Debug log

    // Redirect to signed URL for download
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

    // Parse account details
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountName = connectionString.match(/AccountName=([^;]+)/)[1];
    const accountKey = connectionString.match(/AccountKey=([^;]+)/)[1];
    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    );

    // Full SAS options for blob-specific token
    const sasOptions = {
      containerName: "files", // Your container
      blobName: file.publicId, // The unique path from upload
      permissions: BlobSASPermissions.parse("r"), // Read-only
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
      protocol: "https", // Enforce HTTPS
      version: "2023-08-03", // Valid Azure service version
    };

    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential
    ).toString();
    const signedUrl = `https://${accountName}.blob.core.windows.net/${sasOptions.containerName}/${sasOptions.blobName}?${sasToken}`;

    console.log("Generated SAS URL for view:", signedUrl); // Debug log

    // Stream the file content with inline headers for viewing
    const response = await axios({
      method: "get",
      url: signedUrl,
      responseType: "stream",
    });

    res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);
    const mimeType = mime.lookup(file.format) || "application/octet-stream";
    res.setHeader("Content-Type", mimeType);
    response.data.pipe(res);

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

    // Rename in Azure: Copy to new blob, delete old
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    const containerClient = blobServiceClient.getContainerClient("files");
    const oldBlobClient = containerClient.getBlockBlobClient(
      existingFile.publicId
    );
    const newFileName = existingFile.publicId.replace(existingFile.name, name); // Update path
    const newBlobClient = containerClient.getBlockBlobClient(newFileName);

    await newBlobClient.beginCopyFromURL(oldBlobClient.url);
    await oldBlobClient.deleteIfExists();

    // Update Prisma
    const file = await prisma.file.update({
      where: {
        id: fileId,
      },
      data: {
        name: name,
        publicId: newFileName, // Update publicId to new path
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
