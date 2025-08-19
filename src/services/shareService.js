const { PrismaClient } = require("../generated/prisma");

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { NO_PERMISSION_TO_VIEW } = require("../constants/messages");
const logger = require("../config/logger");
const prisma = new PrismaClient();

const generateShareLink = () => {
  return crypto.randomBytes(16).toString("hex");
};
const getExistingShareLink = async (fileId, userId) => {
  try {
    const existingShare = await prisma.sharedLink.findFirst({
      where: {
        fileId: fileId,
        userId: userId,
        isActive: true,
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            size: true,
            format: true,
            url: true,
          },
        },
      },
    });
    return existingShare;
  } catch (error) {
    throw new Error(`Failed to check existing share: ${error.message}`);
  }
};

const createShareLink = async (fileId, userId, options) => {
  const { canView, canDownload, password, expiresAt, maxDownloads } = options;
  try {
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        ownerId: userId,
        isDeleted: false,
      },
    });
    if (!file) {
      throw new Error(NO_PERMISSION_TO_VIEW);
    }
    let passwordHash = null;
    if (options && password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    const shareToken = generateShareLink();
    const shareLink = await prisma.sharedLink.create({
      data: {
        shareToken: shareToken,
        fileId: fileId,
        userId: userId,
        canView: canView,
        canDownload: canDownload,
        passwordHash: passwordHash,
        expiresAt: expiresAt,
        maxDownloads: maxDownloads,
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            size: true,
            format: true,
            url: true,
          },
        },
      },
    });
    return shareLink;
  } catch (error) {
    throw new Error(`Failed to create share link: ${error.message}`);
  }
};
const getSharedFileByToken = async (shareToken) => {
  try {
    const sharedLink = await prisma.sharedLink.findFirst({
      where: {
        shareToken: shareToken,
        isActive: true,
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            size: true,
            format: true,
            url: true,
            createdAt: true,
          },
        },
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });
    if (!sharedLink) {
      throw new Error("Shared link not found or expired");
    }
    if (sharedLink.expiresAt && Date.now() > sharedLink.expiresAt) {
      throw new Error("Shared link has expired");
    }
    if (
      sharedLink.maxDownloads &&
      sharedLink.downloadCount >= sharedLink.maxDownloads
    ) {
      throw new Error("Download limit exceeded");
    }
    return sharedLink;
  } catch (error) {
    throw new Error(`Failed to retrieve shared file: ${error.message}`);
  }
};
const updateShareLinkService = async (shareId, userId, updateOptions) => {
  const {
    canView,
    canDownload,
    password,
    expiresAt,
    maxDownloads,
    removePassword = false,
  } = updateOptions;

  const existingShare = await prisma.sharedLink.findFirst({
    where: {
      userId: userId,
      id: shareId,
      isActive: true,
    },
  });
  if (!existingShare) {
    throw new Error("Share link not found or access denied to the user");
  }
  let passwordHash = existingShare.passwordHash;
  if (removePassword) {
    passwordHash = null;
  } else if (password) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  const updateShare = await prisma.sharedLink.update({
    where: {
      id: shareId,
    },
    data: {
      canView: canView !== undefined ? canView : existingShare.canView,
      canDownload:
        canDownload !== undefined ? canDownload : existingShare.canDownload,
      passwordHash: passwordHash,
      expiresAt: expiresAt !== undefined ? expiresAt : existingShare.expiresAt,
      maxDownloads:
        maxDownloads !== undefined ? maxDownloads : existingShare.maxDownloads,
      updatedAt: new Date(),
    },
    include: {
      file: {
        select: {
          id: true,
          name: true,
          size: true,
          format: true,
          url: true,
        },
      },
    },
  });

  return updateShare;
};
const downloadSharedFileService = async (shareToken) => {
  try {
    const sharedData = await getSharedFileByToken(shareToken);
    logger.info(
      `File download initiated: ${sharedData.file.id} via token: ${shareToken}`
    );

    // Increment download count
    await prisma.sharedLink.update({
      where: {
        id: sharedData.id,
      },
      data: {
        downloadCount: {
          increment: 1,
        },
      },
    });
    logger.info(
      `File downloaded via share: ${shareToken}, count: ${
        sharedData.downloadCount + 1
      }`
    );

    return sharedData;
  } catch (error) {
    logger.error(`Failed to download shared file: ${error.message}`);
    throw new Error(`Failed to download shared file: ${error.message}`);
  }
};

module.exports = {
  generateShareLink,
  getExistingShareLink,
  createShareLink,
  getSharedFileByToken,
  updateShareLinkService,
  downloadSharedFileService,
};
