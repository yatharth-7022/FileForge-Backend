const logger = require("../config/logger");

const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error("Unhandled error:", {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    user: req.user ? req.user.id : "anonymous",
  });

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({
      error: "An unexpected error occurred",
    });
  } else {
    res.status(500).json({
      error: err.message,
      stack: err.stack,
    });
  }
};

module.exports = errorHandler;
