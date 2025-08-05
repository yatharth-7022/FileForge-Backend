const { PrismaClient } = require("../generated/prisma");
const cloudinary = require("../config/cloudinary");
const { Readable } = require("stream");
const { format } = require("path");
const { search } = require("../routes/upload");
const { application } = require("express");

const prisma = new PrismaClient();
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw", // Changed from "auto" to "raw"
        type: "private", // Add this to ensure private access
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

    // Get the file format from the mimetype
    const format = req.file.mimetype.split("/")[1];

    const file = await prisma.file.create({
      data: {
        name: req.file.originalname,
        url: cloudinaryResponse.secure_url,
        format: format, // Using the extracted format
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
      message: "Filed retrieved successfully",
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
        ownerId: userId, // Show user's own deleted files
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
    if (!trashFiles) {
      return res.status(400).json({
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

    // Set appropriate headers
    res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);
    const mimeType =
      file.format === "pdf"
        ? "application/pdf"
        : file.format === "doc" || file.format === "docx"
        ? "application/msword"
        : `application/${file.format}`;

    res.setHeader("Content-Type", mimeType);

    // Generate a signed URL with the correct resource type
    const signedUrl = cloudinary.url(file.publicId, {
      resource_type: "raw", // Changed from 'auto' to 'raw'
      secure: true,
      type: "private",
      format: file.format,
      sign_url: true,
      attachment: true, // This will force download
    });

    // Log the URL for debugging
    console.log("Generated Cloudinary URL:", signedUrl);

    const axios = require("axios");
    const response = await axios({
      method: "get",
      url: signedUrl,
      responseType: "stream",
      headers: {
        Accept: "*/*", // Accept any content type
      },
    });

    // Pipe the response to our response
    response.data.pipe(res);
  } catch (error) {
    console.error("Download error details:", {
      message: error.message,
      status: error.response?.status,
      cloudinaryError: error.response?.headers?.["x-cld-error"],
    });

    if (!res.headersSent) {
      res.status(500).json({
        message: "Error processing download request",
        details: error.message,
      });
    }
  }
};
module.exports = {
  uploadFile,
  getAllFiles,
  deleteFile,
  softDeleteFiles,
  viewTrashFiles,
  downloadFile,
};
