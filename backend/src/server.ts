import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { connectDatabase } from "./config/db";
import { env } from "./config/env";
import authRoutes from "./routes/authRoutes";
import projectRoutes from "./routes/projectRoutes";
import datasetRoutes from "./routes/datasetRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import visualRoutes from "./routes/visualRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import shareRoutes from "./routes/shareRoutes";
import versionRoutes from "./routes/versionRoutes";
import { errorHandler } from "./middleware/error";

const app = express();
fs.mkdirSync(path.resolve(process.cwd(), env.uploadDir), { recursive: true });

app.use(cors({ origin: env.clientUrl }));
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "DataCanvas API" }));

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/datasets", datasetRoutes);
app.use("/api/dashboards", dashboardRoutes);
app.use("/api/visualizations", visualRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/shares", shareRoutes);
app.use("/api/versions", versionRoutes);

app.use(errorHandler);

connectDatabase()
  .then(() => app.listen(env.port, () => console.log(`DataCanvas API running on http://localhost:${env.port}`)))
  .catch(err => { console.error("Database connection failed", err); process.exit(1); });