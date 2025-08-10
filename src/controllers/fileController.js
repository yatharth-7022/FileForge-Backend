const { PrismaClient } = require("../generated/prisma");
const { Readable } = require("stream");
const mime = require("mime-types");
const { sign } = require("crypto");
const axios = require("axios");
const { REFUSED } = require("dns");
const crypto = require("crypto");
const { UploadClient } = require("@uploadcare/upload-client");
const uploadcare = require("uploadcare")(
  process.env.UPLOADCARE_PUBLIC_KEY,
  process.env.UPLOADCARE_SECRET_KEY
);
const client = new UploadClient({
  publicKey: process.env.UPLOADCARE_PUBLIC_KEY,
});

const prisma = new PrismaClient();

function authHeader() {
  return `Uploadcare.Simple ${process.env.UPLOADCARE_PUBLIC_KEY}:${process.env.UPLOADCARE_SECRET_KEY}`;
}

async function waitForConversion(
  token,
  auth,
  { timeoutMs = 30000, intervalMs = 1000 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = `https://api.uploadcare.com/convert/document/status/${token}/`;
    const resp = await axios.get(url, {
      headers: {
        Accept: "application/vnd.uploadcare-v0.7+json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
      validateStatus: () => true,
    });

    if (resp.status >= 400)
      throw new Error(
        `Status check HTTP ${resp.status}: ${JSON.stringify(resp.data)}`
      );

    const status = resp.data?.status;
    if (status === "finished") return resp.data;
    if (status === "failed")
      throw new Error(
        `Document conversion failed: ${JSON.stringify(resp.data)}`
      );

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Document conversion timed out");
}

// Wait until the freshly uploaded file becomes ready on Uploadcare
// Some conversions fail if started immediately after upload because the source isn't ready yet
async function waitForUploadReady(
  uuid,
  auth,
  { timeoutMs = 60000, intervalMs = 1000 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = `https://api.uploadcare.com/files/${uuid}/`;
    const resp = await axios.get(url, {
      headers: {
        Accept: "application/vnd.uploadcare-v0.7+json",
        Authorization: auth,
      },
      validateStatus: () => true,
    });

    if (resp.status >= 400)
      throw new Error(
        `File status HTTP ${resp.status}: ${JSON.stringify(resp.data)}`
      );

    if (resp.data?.is_ready) return resp.data;

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Source file not ready in time");
}

async function generateThumbnailForPdf(pdfUuid) {
  console.log("Starting thumbnail generation for UUID:", pdfUuid);

  const auth = authHeader();
  const conversionPath = `https://ucarecdn.com/${pdfUuid}/document/-/format/jpg/-/page/1/`;

  console.log("Conversion path:", conversionPath);

  const convertResp = await axios.post(
    "https://api.uploadcare.com/convert/document/",
    { paths: [conversionPath], store: "1" },
    {
      headers: {
        Accept: "application/vnd.uploadcare-v0.7+json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
    }
  );

  console.log("Convert response:", JSON.stringify(convertResp.data, null, 2));

  const token = convertResp.data?.result?.[0]?.token;
  if (!token) {
    console.error("No conversion token received:", convertResp.data);
    throw new Error("No conversion token received");
  }

  console.log("Got conversion token:", token);

  const statusData = await waitForConversion(token, auth, {
    timeoutMs: 120000,
    intervalMs: 1500,
  });

  console.log("Final status data:", JSON.stringify(statusData, null, 2));

  let thumbnailUuid;
  if (Array.isArray(statusData?.result)) {
    thumbnailUuid = statusData.result[0]?.uuid;
  } else {
    thumbnailUuid = statusData?.result?.uuid;
  }

  if (!thumbnailUuid) {
    console.error("No thumbnail UUID received:", statusData);
    throw new Error("No thumbnail UUID received");
  }

  console.log("Generated thumbnail UUID:", thumbnailUuid);
  return thumbnailUuid;
}

const uploadFile = async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!req.file) {
      return res.status(400).json({ message: "File not found" });
    }

    const file = req.file;

    if (!file.buffer || !(file.buffer instanceof Buffer)) {
      return res.status(400).json({
        message: "Invalid file buffer",
        debug: {
          hasBuffer: !!file.buffer,
          bufferType: file.buffer ? typeof file.buffer : "undefined",
          isBuffer: file.buffer instanceof Buffer,
        },
      });
    }

    // Upload to Uploadcare
    const uploadResult = await client.uploadFile(file.buffer, {
      fileName: file.originalname,
      contentType: file.mimetype,
      store: "auto",
      metadata: { userId: String(userId) },
    });

    console.log("File uploaded to Uploadcare:", {
      uuid: uploadResult.uuid,
      mimetype: file.mimetype,
    });

    // Save initial file record
    let uploadedFile = await prisma.file.create({
      data: {
        publicId: uploadResult.uuid,
        name: file.originalname,
        url: uploadResult.cdnUrl,
        format: file.mimetype.split("/")[1],
        size: file.size,
        ownerId: userId,
        isDeleted: false,
      },
    });

    console.log("File saved to database with ID:", uploadedFile.id);

    // Generate thumbnail for PDFs automatically
    if (file.mimetype === "application/pdf") {
      try {
        console.log(
          "PDF detected, generating thumbnail for UUID:",
          uploadResult.uuid
        );
        // Ensure the uploaded PDF is fully ready before requesting conversion
        try {
          const auth = authHeader();
          await waitForUploadReady(uploadResult.uuid, auth, {
            timeoutMs: 60000,
            intervalMs: 1000,
          });
        } catch (readinessError) {
          console.warn(
            "Uploadcare file not ready yet, proceeding may fail:",
            readinessError?.message || readinessError
          );
        }
        const thumbnailUuid = await generateThumbnailForPdf(uploadResult.uuid);

        // Update file record with thumbnail info
        uploadedFile = await prisma.file.update({
          where: { id: uploadedFile.id },
          data: {
            thumbnailUuid: thumbnailUuid,
            thumbnailUrl: `https://ucarecdn.com/${thumbnailUuid}/`,
          },
        });
        console.log(
          "Thumbnail generated and saved successfully:",
          thumbnailUuid
        );
      } catch (thumbnailError) {
        console.error("Thumbnail generation failed:", thumbnailError);
        console.error("Thumbnail error stack:", thumbnailError.stack);
        // Fallback: use Uploadcare on-the-fly preview of page 1 if conversion fails
        try {
          const fallbackUrl = `https://ucarecdn.com/${uploadResult.uuid}/-/preview/300x300/`;
          uploadedFile = await prisma.file.update({
            where: { id: uploadedFile.id },
            data: {
              thumbnailUrl: fallbackUrl,
            },
          });
          console.log("Applied fallback thumbnail URL:", fallbackUrl);
        } catch (fallbackErr) {
          console.warn(
            "Failed to set fallback thumbnail:",
            fallbackErr?.message || fallbackErr
          );
        }
        // Don't fail the upload if thumbnail generation fails
      }
    }

    res.status(200).json({
      message: "File uploaded successfully",
      file: {
        id: uploadedFile.id,
        name: uploadedFile.name,
        format: uploadedFile.format,
        size: uploadedFile.size,
        url: uploadedFile.url,
        thumbnailUrl: uploadedFile.thumbnailUrl || null,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
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
        thumbnailUrl: true,
      },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      message: "Files retrieved successfully",
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
      // Delete from Uploadcare using UUID
      await uploadcare.deleteFile(file.publicId);
    } catch (uploadcareError) {
      console.error("Error deleting file from Uploadcare:", uploadcareError);
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
      return res.status(404).json({
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
    const userId = req.user.userId; // set by your auth middleware
    const fileId = req.params.fileId; // INTERNAL Prisma file id from route param

    // Fetch file record and validate access
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

    // file.publicId must be the Uploadcare UUID (e.g., '07c27115-bfa2-4dc4-a105-b23c12b0f152')
    if (!file.publicId) {
      return res
        .status(400)
        .json({ message: "File has no Uploadcare publicId (UUID) stored" });
    }

    // Build CDN base URL directly
    const baseUrl = `https://ucarecdn.com/${file.publicId}/`;

    // Generate signed URL (expires in 1 hour)
    const expires = Math.floor(Date.now() / 1000) + 3600; // Unix timestamp
    const stringToSign = `${file.publicId}${expires}`;
    const token = crypto
      .createHmac("sha1", process.env.UPLOADCARE_SECRET_KEY)
      .update(stringToSign)
      .digest("hex");

    const signedUrl = `${baseUrl}?token=${token}&expires=${expires}`;

    // Force attachment filename on client
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    return res.redirect(302, signedUrl);
  } catch (error) {
    console.error("Download error details:", {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      message: "Error processing download request",
      details: error.message,
    });
  }
};

const viewFile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const fileId = req.params.fileId;

    // 1) Authorize and fetch file
    const file = await prisma.file.findFirst({
      where: { id: fileId, ownerId: userId, isDeleted: false },
    });

    if (!file) {
      return res.status(404).json({
        message: "File not found or you don't have permission to view",
      });
    }

    if (!file.publicId) {
      return res
        .status(400)
        .json({ message: "Missing Uploadcare UUID (publicId) on file record" });
    }

    // 2) Build CDN URL directly from UUID
    const baseUrl = `https://ucarecdn.com/${file.publicId}/`;

    // 3) Optional: secure delivery via signed URL (expires in 1 hour)
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = crypto
      .createHmac("sha1", process.env.UPLOADCARE_SECRET_KEY)
      .update(`${file.publicId}${expires}`)
      .digest("hex");

    const signedUrl = `${baseUrl}?token=${token}&expires=${expires}`; // per secure delivery pattern

    // 4) Stream the file inline
    const response = await axios.get(signedUrl, { responseType: "stream" });

    // Set headers for inline display
    res.setHeader("Content-Disposition", `inline; filename="${file.name}"`);
    const contentType =
      mime.lookup(file.name) ||
      mime.lookup(file.format) ||
      "application/octet-stream";
    res.setHeader("Content-Type", contentType);

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
    res.status(500).json({
      message: "Error generating view",
      details: error.message,
    });
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

function authHeader() {
  return `Uploadcare.Simple ${process.env.UPLOADCARE_PUBLIC_KEY}:${process.env.UPLOADCARE_SECRET_KEY}`;
}

async function waitForConversion(
  token,
  auth,
  { timeoutMs = 30000, intervalMs = 1000 } = {}
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = `https://api.uploadcare.com/convert/document/status/${token}/`;
    const resp = await axios.get(url, {
      headers: {
        Accept: "application/vnd.uploadcare-v0.7+json",
        "Content-Type": "application/json",
        Authorization: auth,
      },
      validateStatus: () => true,
    });

    if (resp.status >= 400)
      throw new Error(
        `Status check HTTP ${resp.status}: ${JSON.stringify(resp.data)}`
      );

    const status = resp.data?.status;
    if (status === "finished") return resp.data;
    if (status === "failed")
      throw new Error(
        `Document conversion failed: ${JSON.stringify(resp.data)}`
      );

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Document conversion timed out");
}

const getPdfThumbnail = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await prisma.file.findFirst({
      where: { id: fileId, ownerId: userId, isDeleted: false },
    });

    if (!file)
      return res
        .status(404)
        .json({ message: "File not found or no permission" });

    if (!file.publicId)
      return res
        .status(400)
        .json({ message: "Missing Uploadcare UUID (publicId)" });

    if ((file.format || "").toLowerCase() !== "pdf") {
      return res.status(400).json({ message: "File is not a PDF" });
    }

    // Optional sanity check: ensure UUID looks like a UUID
    if (!/^[0-9a-f-]{36}$/i.test(file.publicId)) {
      return res
        .status(400)
        .json({ message: "Invalid Uploadcare UUID format in publicId" });
    }

    const auth = authHeader();

    // Use the CDN URL format for document conversion as shown in Uploadcare docs
    // This converts the first page of the PDF to JPG format
    const conversionPath = `https://ucarecdn.com/${file.publicId}/document/-/format/jpg/-/page/1/`;

    const convertResp = await axios.post(
      "https://api.uploadcare.com/convert/document/",
      {
        paths: [conversionPath],
        store: "1",
      },
      {
        headers: {
          Accept: "application/vnd.uploadcare-v0.7+json",
          "Content-Type": "application/json",
          Authorization: auth,
        },
        validateStatus: () => true,
      }
    );

    if (convertResp.status >= 400) {
      return res.status(502).json({
        message: "Uploadcare convert API error",
        details: { status: convertResp.status, data: convertResp.data },
      });
    }

    const first = convertResp.data?.result?.[0];
    if (!first?.token) {
      // If result is empty or problems exist, bubble it up to help debug
      return res.status(500).json({
        message: "Unexpected conversion response",
        details: convertResp.data,
      });
    }

    const statusData = await waitForConversion(first.token, auth, {
      timeoutMs: 120000,
      intervalMs: 1500,
    });

    // Handle both array and object result formats
    let thumbnailUuid;
    if (Array.isArray(statusData?.result)) {
      // Array format: result[0].uuid
      thumbnailUuid = statusData.result[0]?.uuid;
    } else {
      // Object format: result.uuid
      thumbnailUuid = statusData?.result?.uuid;
    }

    if (!thumbnailUuid) {
      return res.status(500).json({
        message: "Conversion finished without result UUID",
        details: statusData,
      });
    }
    const thumbnailUrl = `https://ucarecdn.com/${thumbnailUuid}/`;

    // Optional: consistently small preview
    // const thumbnailUrl = `https://ucarecdn.com/${thumbnailUuid}/-/preview/300x300/`;

    return res.status(200).json({
      message: "PDF thumbnail generated",
      thumbnailUuid,
      thumbnailUrl,
      format: "jpeg",
    });
  } catch (error) {
    console.error("PDF thumbnail generation error:", error);
    return res.status(500).json({
      message: "Error generating PDF thumbnail",
      details: error.message,
    });
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
