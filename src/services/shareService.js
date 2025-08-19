const { PrismaClient } = require("../generated/prisma");

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { NO_PERMISSION_TO_VIEW } = require("../constants/messages");
const logger = require("../config/logger");
const {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} = require("../utils/error");
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

  const file = await prisma.file.findFirst({
    where: {
      id: fileId,
      ownerId: userId,
      isDeleted: false,
    },
  });
  if (!file) {
    throw new UnauthorizedError(NO_PERMISSION_TO_VIEW);
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
  if (!shareLink) {
    throw new NotFoundError("Share link not found");
  }
  return shareLink;
};
const getSharedFileByToken = async (shareToken) => {
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
    throw new NotFoundError("Shared link not found or expired");
  }
  if (sharedLink.expiresAt && Date.now() > sharedLink.expiresAt) {
    throw new UnauthorizedError("Shared link has expired");
  }
  if (
    sharedLink.maxDownloads &&
    sharedLink.downloadCount >= sharedLink.maxDownloads
  ) {
    throw new ForbiddenError("Download limit exceeded");
  }
  return sharedLink;
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
    throw new NotFoundError(
      "Share link not found or access denied to the user"
    );
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
};
const deleteShareLinkService = async (shareId, userId) => {
  if (!shareId || !userId)
    throw new BadRequestError("Invalid share or user id");
  const existingShare = await prisma.sharedLink.findFirst({
    where: {
      userId: userId,
      id: shareId,
      isActive: true,
    },
  });
  if (!existingShare)
    throw new NotFoundError(
      "Share link not found or access denied to the user"
    );

  const response = await prisma.sharedLink.update({
    where: {
      id: shareId,
    },
    data: {
      isActive: false,
      updatedAt: new Date(),
    },
  });
  if (!response) {
    throw new Error("Failed to delete share link");
  }
  return response;
};

module.exports = {
  generateShareLink,
  getExistingShareLink,
  createShareLink,
  getSharedFileByToken,
  updateShareLinkService,
  downloadSharedFileService,
  deleteShareLinkService,
};
