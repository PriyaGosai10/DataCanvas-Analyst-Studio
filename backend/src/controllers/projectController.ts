import { Response } from "express";
import Project from "../models/Project";
import Dashboard from "../models/Dashboard";
import Dataset from "../models/Dataset";
import Visualization from "../models/Visualization";
import ActivityLog from "../models/ActivityLog";
import { AuthRequest } from "../middleware/auth";
export async function listProjects(req: AuthRequest, res: Response) { res.json(await Project.find({ ownerId: req.userId }).sort({ updatedAt: -1 })); }
export async function createProject(req: AuthRequest, res: Response) {
  const project = await Project.create({ ownerId: req.userId, name: String(req.body.name || "Untitled Project").trim(), description: req.body.description || "" });
  try {
    await ActivityLog.create({ userId: req.userId, projectId: project.id, action: "project.created", details: project.name });
  } catch (error) {
    // Activity logging is secondary; do not report project creation as failed if the project was saved.
    console.error("Project created, but activity log could not be saved:", error);
  }
  res.status(201).json(project);
}
export async function getProject(req: AuthRequest, res: Response) {
  const project = await Project.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!project) return res.status(404).json({ message: "Project not found" });
  const [dashboards, datasets] = await Promise.all([Dashboard.find({ projectId: project.id, ownerId: req.userId }).sort({ updatedAt: -1 }), Dataset.find({ projectId: project.id, ownerId: req.userId }).sort({ createdAt: -1 })]);
  res.json({ project, dashboards, datasets });
}
export async function deleteProject(req: AuthRequest, res: Response) {
  const project = await Project.findOneAndDelete({ _id: req.params.id, ownerId: req.userId });
  if (!project) return res.status(404).json({ message: "Project not found" });
  const dashboards = await Dashboard.find({ projectId: project.id, ownerId: req.userId });
  const dashboardIds = dashboards.map(d => d.id);
  await Promise.all([Dashboard.deleteMany({ projectId: project.id, ownerId: req.userId }), Dataset.deleteMany({ projectId: project.id, ownerId: req.userId }), ActivityLog.deleteMany({ projectId: project.id })]);
  if (dashboardIds.length) await Visualization.deleteMany({ dashboardId: { $in: dashboardIds } });
  res.json({ message: "Project deleted" });
}
