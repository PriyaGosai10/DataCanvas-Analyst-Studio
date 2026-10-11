import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import Dashboard from "../models/Dashboard";
import Visualization from "../models/Visualization";
import DashboardVersion from "../models/DashboardVersion";

export async function createVersion(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  const visuals = await Visualization.find({ dashboardId: dashboard.id });
  const last = await DashboardVersion.findOne({ dashboardId: dashboard.id }).sort({ version: -1 });
  const version = (last?.version || 0) + 1;
  const record = await DashboardVersion.create({ dashboardId: dashboard.id, ownerId: req.userId, version, snapshot: { dashboard: dashboard.toObject(), visuals: visuals.map(v => v.toObject()) } });
  res.status(201).json(record);
}
export async function listVersions(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  res.json(await DashboardVersion.find({ dashboardId: req.params.id, ownerId: req.userId }).sort({ version: -1 }));
}
export async function restoreVersion(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  const version = await DashboardVersion.findOne({ _id: req.params.versionId, dashboardId: dashboard.id, ownerId: req.userId });
  if (!version) return res.status(404).json({ message: "Version not found" });
  const snap: any = version.snapshot;
  await Dashboard.findByIdAndUpdate(dashboard.id, { $set: { name: snap.dashboard.name, theme: snap.dashboard.theme || "light", pages: snap.dashboard.pages || [{ id: "page-1", name: "Overview" }], filters: snap.dashboard.filters || {} } });
  await Visualization.deleteMany({ dashboardId: dashboard.id });
  const docs = (snap.visuals || []).map((v: any) => { const copy = { ...v }; delete copy._id; delete copy.createdAt; delete copy.updatedAt; delete copy.__v; copy.dashboardId = dashboard.id; return copy; });
  if (docs.length) await Visualization.insertMany(docs);
  res.json(await Dashboard.findById(dashboard.id));
}
