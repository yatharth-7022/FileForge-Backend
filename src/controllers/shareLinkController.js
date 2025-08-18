const { NO_PERMISSION_TO_VIEW } = require("../constants/messages");
const {
  getExistingShareLink,
  getSharedFileByToken,
} = require("../services/shareService");
const logger = require("../config/logger");
const {
  createShareLink: createShareLinkService,
} = require("../services/shareService");

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
      canDownload: false,
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

    if (error.message.includes(NO_PERMISSION_TO_VIEW)) {
      return res.status(403).json({
        success: false,
        message: NO_PERMISSION_TO_VIEW,
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create share link",
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
    if (
      error.message.includes("not found") ||
      error.message.includes("expired")
    ) {
      return res.status(404).json({
        success: false,
        message: "Share link not found or has expired",
      });
    }

    if (error.message.includes("limit exceeded")) {
      return res.status(403).json({
        success: false,
        message: "Download limit has been exceeded for this share",
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to retrieve shared file",
    });
  }
};

module.exports = {
  createShareLink,
  getPublicSharedFile,
};
