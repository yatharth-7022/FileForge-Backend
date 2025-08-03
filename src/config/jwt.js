// src/config/jwt.js
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "24h";

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
};
