import dotenv from "dotenv";
dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
const configuredJwtSecret = process.env.JWT_SECRET;
if (isProduction && (!configuredJwtSecret || configuredJwtSecret.length < 32 || configuredJwtSecret === "dev_only_change_me" || configuredJwtSecret === "change_this_to_a_long_random_secret")) {
  throw new Error("Production startup blocked: set JWT_SECRET to a strong random secret of at least 32 characters.");
}
if (isProduction && !process.env.MONGODB_URI) {
  throw new Error("Production startup blocked: configure MONGODB_URI explicitly.");
}
if (isProduction && (!process.env.CLIENT_URL || /^https?:\/\/localhost(?::|$)/i.test(process.env.CLIENT_URL))) {
  throw new Error("Production startup blocked: configure CLIENT_URL to the deployed frontend origin.");
}

export const env = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/datacanvas",
  jwtSecret: configuredJwtSecret || "dev_only_change_me",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  uploadDir: process.env.UPLOAD_DIR || "uploads"
};
