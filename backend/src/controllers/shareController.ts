import { Response } from "express";
import crypto from "crypto";
import path from "path";
import { AuthRequest } from "../middleware/auth";
import Dashboard from "../models/Dashboard";
import Visualization from "../models/Visualization";
import Share from "../models/Share";
import Dataset from "../models/Dataset";
import { env } from "../config/env";
import { aggregateRows } from "../services/analyticsService";
import { CalculatedMeasure, CalculatedColumn, Relationship } from "../services/semanticModelService";

export async function createShare(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOne({ _id: req.body.dashboardId, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  const share = await Share.create({ dashboardId: dashboard.id, ownerId: req.userId, token: crypto.randomBytes(18).toString("hex") });
  res.status(201).json(share);
}
export async function listShares(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOne({ _id: req.params.dashboardId, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  res.json(await Share.find({ dashboardId: dashboard.id, ownerId: req.userId }).sort({ createdAt: -1 }));
}
export async function revokeShare(req: AuthRequest, res: Response) {
  const share = await Share.findOneAndUpdate({ _id: req.params.id, ownerId: req.userId }, { active: false }, { new: true });
  if (!share) return res.status(404).json({ message: "Share not found" });
  res.json(share);
}
export async function publicDashboard(req: AuthRequest, res: Response) {
  const share = await Share.findOne({ token: req.params.token, active: true });
  if (!share) return res.status(404).json({ message: "Share link is invalid or revoked" });
  const dashboard = await Dashboard.findById(share.dashboardId);
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  const visuals = await Visualization.find({ dashboardId: share.dashboardId });
  const result = [];
  for (const visual of visuals) {
    const dataset = await Dataset.findById(visual.datasetId);
    let data: any[] = [];
    if (dataset) {
      const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
      const measure = visual.measureId ? ((dataset.calculatedMeasures || []) as CalculatedMeasure[]).find((m) => m.id === String(visual.measureId) && m.active) : undefined;
      data = aggregateRows(filePath, visual.xField ?? undefined, visual.yField ?? undefined, visual.aggregation || "sum", dashboard.filters || {}, visual.type, 100, "paginate", dataset.selectedSheet, (dataset.preparationHistory || []) as any[], (dataset.calculatedColumns || []) as CalculatedColumn[], (dataset.relationships || []) as Relationship[], measure);
    }
    result.push({ ...visual.toObject(), data });
  }
  res.json({ dashboard, visuals: result });
}
