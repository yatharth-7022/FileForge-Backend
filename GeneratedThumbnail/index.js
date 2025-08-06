const sharp = require("sharp");
const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
  try {
    const { fileName, containerName } = req.body;
    if (!fileName || !containerName) {
      context.res = { status: 400, body: "Missing fileName or containerName" };
      return;
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AzureWebJobsStorage
    );
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const pdfBlobClient = containerClient.getBlobClient(fileName);

    const pdfBuffer = await pdfBlobClient.downloadToBuffer();

    const thumbnailBuffer = await sharp(pdfBuffer, { page: 0 })
      .resize({ width: 300, fit: "contain" })
      .jpeg({ quality: 80 })
      .toBuffer();

    const thumbnailName = `thumbnails/${fileName
      .split("/")
      .pop()
      .replace(".pdf", ".jpg")}`;
    const thumbnailBlobClient = containerClient.getBlobClient(thumbnailName);
    await thumbnailBlobClient.uploadData(thumbnailBuffer, {
      blobHTTPHeaders: { blobContentType: "image/jpeg" },
    });

    context.res = {
      status: 200,
      body: { thumbnailUrl: thumbnailBlobClient.url },
    };
  } catch (error) {
    context.log.error("Thumbnail error:", error);
    context.res = { status: 500, body: "Error generating thumbnail" };
  }
};
