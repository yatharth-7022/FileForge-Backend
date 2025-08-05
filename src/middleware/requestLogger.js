const logger = require("../config/logger");

const requestLogger = (req, res, next) => {
  // Log at the start of the request
  logger.info(`Incoming ${req.method} request`, {
    path: req.path,
    query: req.query,
    body: req.method !== "GET" ? req.body : undefined,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });

  // Get the original send function
  const originalSend = res.send;

  // Override the send function to log the response
  res.send = function (body) {
    // Log the response
    logger.info(`Outgoing response for ${req.method}`, {
      path: req.path,
      statusCode: res.statusCode,
      responseTime: Date.now() - req._startTime,
    });

    // Call the original send function
    originalSend.call(this, body);
  };

  // Store the start time
  req._startTime = Date.now();

  next();
};

module.exports = requestLogger;
