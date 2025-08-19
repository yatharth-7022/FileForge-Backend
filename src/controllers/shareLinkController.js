const { NO_PERMISSION_TO_VIEW } = require("../constants/messages");
const {
  getExistingShareLink,
  getSharedFileByToken,
  updateShareLinkService,
  downloadSharedFileService,
  deleteShareLinkService,
} = require("../services/shareService");
const logger = require("../config/logger");
const {
  createShareLink: createShareLinkService,
} = require("../services/shareService");
const bcrypt = require("bcryptjs");
const createShareLink = async (req, res) => {
  const fileId = req.params.fileId;
  const userId = req.user.userId;
  try {
    const existingShare = await getExistingShareLink(fileId, userId);

    if (existingShare) {
      return res.status(200).json({
        success: true,
        message: "Share link retrieved successfully",
        data: {
          id: existingShare.id,
          shareToken: `${process.env.FRONTEND_URL || "localhost:3000"}/share/${
            existingShare.shareToken
          }`,
          canView: existingShare.canView,
          canDownload: existingShare.canDownload,
          canEdit: existingShare.canEdit,
          hasPassword: !!existingShare.passwordHash,
          expiresAt: existingShare.expiresAt,
          maxDownloads: existingShare.maxDownloads,
          downloadCount: existingShare.downloadCount,
          isActive: existingShare.isActive,
          createdAt: existingShare.createdAt,
          updatedAt: existingShare.updatedAt,
        },
      });
    }
    const defaultValues = {
      canView: true,
      canDownload: true,
      password: null,
      expiresAt: null,
      maxDownloads: null,
    };
    const shareLink = await createShareLinkService(
      fileId,
      userId,
      defaultValues
    );

    logger.info(
      `New share link created: ${shareLink.id} for file: ${fileId} with default permissions`
    );
    res.status(201).json({
      success: true,
      message: "Share link created successfully",
      data: {
        id: shareLink.id,
        shareToken: `${process.env.FRONTEND_URL || "localhost:3000"}/share/${
          shareLink.shareToken
        }`,
        canView: shareLink.canView,
        canDownload: shareLink.canDownload,
        canEdit: shareLink.canEdit,
        hasPassword: !!shareLink.passwordHash,
        expiresAt: shareLink.expiresAt,
        maxDownloads: shareLink.maxDownloads,
        downloadCount: shareLink.downloadCount,
        isActive: shareLink.isActive,
        createdAt: shareLink.createdAt,
        updatedAt: shareLink.updatedAt,
      },
    });
  } catch (error) {
    logger.error(
      `Failed to create share link for file: ${fileId}. Error: ${error.message}`
    );

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
const getPublicSharedFile = async (req, res) => {
  const { shareToken } = req.params;
  try {
    const sharedData = await getSharedFileByToken(shareToken);
    logger.info(
      `Public access to shared file: ${sharedData.file.id} via token: ${shareToken}`
    );
    if (sharedData.passwordHash) {
      // Password protected - return limited info only
      logger.info(`Password-protected share accessed: ${shareToken}`);

      return res.status(200).json({
        success: true,
        message: "Password required to access this file",
        data: {
          shareId: sharedData.id,
          requiresPassword: true,
          permissions: {
            canView: sharedData.canView,
            canDownload: sharedData.canDownload,
          },
          file: {
            name: sharedData.file.name,
            format: sharedData.file.format,
            size: sharedData.file.size,
            // url: HIDDEN!
          },
          sharedBy: {
            name: sharedData.user.name,
          },
          expiresAt: sharedData.expiresAt,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "Shared file retrieved successfully",
      data: {
        shareId: sharedData.id,
        sharedToken: sharedData.shareToken,
        permissions: {
          canView: sharedData.canView,
          canEdit: sharedData.canEdit,
          canDownload: sharedData.canDownload,
        },
        file: {
          id: sharedData.file.id,
          name: sharedData.file.name,
          format: sharedData.file.format,
          size: sharedData.file.size,
          url: sharedData.file.url,
          uploadedOn: sharedData.file.createdAt,
        },
        sharedBy: {
          id: sharedData.user.id,
          name: sharedData.user.name,
          email: sharedData.user.email,
        },
        downloadCount: sharedData.downloadCount,
        maxDownloads: sharedData.maxDownloads,
        expiresAt: sharedData.expiresAt,
      },
    });
  } catch (error) {
    logger.error(`Failed to retrieve shared file: ${error.message}`);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
const updateShareLink = async (req, res) => {
  try {
    const { shareId } = req.params;
    const userId = req.user.userId;

    const {
      canView,
      canDownload,
      password,
      expiresInDays,
      maxDownloads,
      removePassword = false,
    } = req.body;

    let expiresAt = null;
    if (expiresInDays !== undefined) {
      if (expiresInDays === 0 || expiresInDays === null) {
        expiresAt = null;
      } else {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }
    }
    const updateOptions = {
      canView,
      canDownload,
      password,
      expiresAt,
      maxDownloads,
      removePassword,
    };
    const updateShare = await updateShareLinkService(
      shareId,
      userId,
      updateOptions
    );
    logger.info(`Share link updated: ${shareId} by user: ${userId}`);
    res.status(200).json({
      success: true,
      message: "Share link setting updated successfully",
      data: {
        id: updateShare.id,
        canView: updateShare.canView,
        canDownload: updateShare.canDownload,
        hasPassword: !!updateShare.passwordHash,
        expiresAt: updateShare.expiresAt,
        maxDownloads: updateShare.maxDownloads,
        downloadCount: updateShare.downloadCount,
        isActive: updateShare.isActive,
        updatedAt: updateShare.updatedAt,
        file: {
          id: updateShare.file.id,
          name: updateShare.file.name,
          size: updateShare.file.size,
          format: updateShare.file.format,
        },
      },
    });
  } catch (error) {
    logger.error(`Failed to update share link: ${error.message}`);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
const verifyPassword = async (req, res) => {
  try {
    const { shareToken } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }
    const sharedData = await getSharedFileByToken(shareToken);
    if (!sharedData?.passwordHash) {
      return res.status(400).json({
        success: false,
        message: "This file is not password protected",
      });
    }
    const isPasswordCorrect = await bcrypt.compare(
      password,
      sharedData?.passwordHash
    );
    if (!isPasswordCorrect) {
      logger.warn(`Failed password attempt for share: ${shareToken}`);
      return res.status(401).json({
        success: false,
        message: "Incorrect password",
      });
    }
    logger.info(`Successful password verification for share: ${shareToken}`);

    res.status(200).json({
      success: true,
      message: "Password verified successfully",
      data: {
        shareId: sharedData.id,
        shareToken: sharedData.shareToken,
        permissions: {
          canView: sharedData.canView,
          canDownload: sharedData.canDownload,
          hasPassword: true,
        },
        file: {
          id: sharedData.file.id,
          name: sharedData.file.name,
          format: sharedData.file.format,
          size: sharedData.file.size,
          url: sharedData.file.url,
          uploadedOn: sharedData.file.createdAt,
        },
        sharedBy: {
          id: sharedData.user.id,
          name: sharedData.user.name,
          email: sharedData.user.email,
        },
        downloadCount: sharedData.downloadCount,
        maxDownloads: sharedData.maxDownloads,
        expiresAt: sharedData.expiresAt,
      },
    });
  } catch (error) {
    logger.error(`Password verification failed: ${error.message}`);

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
const downloadSharedFile = async (req, res) => {
  try {
    const { shareToken } = req.params;

    // Get shared file data
    const sharedData = await downloadSharedFileService(shareToken);
    console.log(sharedData, "this is console");
    if (!sharedData) {
      return res.status(404).json({
        success: false,
        message: "Shared file not found",
      });
    }

    // Check download permission
    if (!sharedData.canDownload) {
      return res.status(403).json({
        success: false,
        message: "Download is not allowed for this shared file",
      });
    }

    // Check download limits BEFORE incrementing
    if (
      sharedData.maxDownloads &&
      sharedData.downloadCount >= sharedData.maxDownloads
    ) {
      return res.status(403).json({
        success: false,
        message: "Download limit exceeded for this shared file",
      });
    }

    res.redirect(sharedData.file.url);
  } catch (error) {
    logger.error(
      `Download failed for share ${req.params.shareToken}: ${error.message}`
    );

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
const deleteShareLink = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { shareId } = req.params;
    console.log(shareId, "share id");
    const response = await deleteShareLinkService(shareId, userId);
    if (!response) {
      return res.status(404).json({
        success: false,
        message: "Share link not found or access denied to the user",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Share link deleted successfully",
    });
  } catch (error) {
    logger.error(`Failed to delete share link: ${error.message}`);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
// Update exports
module.exports = {
  createShareLink,
  getPublicSharedFile,
  updateShareLink,
  verifyPassword,
  downloadSharedFile,
  deleteShareLink,
};
