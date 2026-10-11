import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import Dashboard from "../models/Dashboard";
import Visualization from "../models/Visualization";
import Project from "../models/Project";
import ActivityLog from "../models/ActivityLog";

export async function listDashboards(req: AuthRequest, res: Response) {
  const dashboards = await Dashboard.find({ projectId: req.params.projectId, ownerId: req.userId }).sort({ updatedAt: -1 });
  res.json(dashboards);
}
export async function createDashboard(req: AuthRequest, res: Response) {
  const project = await Project.findOne({ _id: req.body.projectId, ownerId: req.userId });
  if (!project) return res.status(404).json({ message: "Project not found" });
  const dashboard = await Dashboard.create({ projectId: project.id, ownerId: req.userId, name: req.body.name || "Untitled Dashboard" });
  await ActivityLog.create({ userId: req.userId, projectId: project.id, action: "dashboard.created", details: dashboard.name });
  res.status(201).json(dashboard);
}
export async function getDashboard(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  const visuals = await Visualization.find({ dashboardId: dashboard.id }).sort({ createdAt: 1 });
  res.json({ dashboard, visuals });
}
export async function updateDashboard(req: AuthRequest, res: Response) {
  const update: any = {};
  if (typeof req.body.name === "string") update.name = req.body.name.trim() || "Untitled Dashboard";
  if (typeof req.body.theme === "string") update.theme = req.body.theme;
  if (Array.isArray(req.body.pages)) update.pages = req.body.pages;
  if (req.body.filters && typeof req.body.filters === "object") update.filters = req.body.filters;
  const dashboard = await Dashboard.findOneAndUpdate({ _id: req.params.id, ownerId: req.userId }, { $set: update }, { new: true });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  res.json(dashboard);
}
export async function deleteDashboard(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOneAndDelete({ _id: req.params.id, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  await Visualization.deleteMany({ dashboardId: dashboard.id });
  await ActivityLog.create({ userId: req.userId, projectId: dashboard.projectId, action: "dashboard.deleted", details: dashboard.name });
  res.json({ message: "Dashboard deleted" });
}
