import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import Dashboard from "../models/Dashboard";
import Dataset from "../models/Dataset";
import Visualization from "../models/Visualization";

const allowedTypes = new Set(["bar", "line", "area", "donut", "pie", "scatter", "kpi"]);

async function ownsDashboard(id: string, userId?: string) {
  return Dashboard.findOne({ _id: id, ownerId: userId });
}

export async function createVisual(req: AuthRequest, res: Response) {
  const { dashboardId, datasetId, type, title, xField, yField, aggregation, measureId, pageId, position, style } = req.body;
  if (!dashboardId || !datasetId || !allowedTypes.has(type)) return res.status(400).json({ message: "dashboardId, datasetId and a supported chart type are required" });
  const dashboard = await ownsDashboard(dashboardId, req.userId);
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  const dataset = await Dataset.findOne({ _id: datasetId, ownerId: req.userId, projectId: dashboard.projectId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  if (measureId && !(dataset.calculatedMeasures || []).some((measure: any) => measure.id === String(measureId) && measure.active)) return res.status(400).json({ message: "Choose an active saved measure belonging to this dataset." });
  const visual = await Visualization.create({
    dashboardId, datasetId, type, title: String(title || "Untitled visualization").trim(), xField, yField,
    aggregation: aggregation || "sum", measureId: String(measureId || ""), pageId: pageId || "page-1",
    position: { x: 0, y: 0, width: 520, height: 320, ...(position || {}) }, style: style || {}
  });
  res.status(201).json(visual);
}

export async function updateVisual(req: AuthRequest, res: Response) {
  const visual = await Visualization.findById(req.params.id);
  if (!visual) return res.status(404).json({ message: "Visualization not found" });
  const dashboard = await ownsDashboard(String(visual.dashboardId), req.userId);
  if (!dashboard) return res.status(403).json({ message: "Not authorized" });
  const update: any = {};
  for (const key of ["type", "title", "xField", "yField", "aggregation", "measureId", "pageId", "position", "style"]) {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  }
  if (update.type && !allowedTypes.has(update.type)) return res.status(400).json({ message: "Unsupported visualization type" });
  if (update.measureId) { const dataset = await Dataset.findOne({ _id: visual.datasetId, ownerId: req.userId }); if (!dataset || !(dataset.calculatedMeasures || []).some((measure: any) => measure.id === String(update.measureId) && measure.active)) return res.status(400).json({ message: "Choose an active saved measure belonging to this dataset." }); }
  res.json(await Visualization.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }));
}

export async function duplicateVisual(req: AuthRequest, res: Response) {
  const visual = await Visualization.findById(req.params.id);
  if (!visual) return res.status(404).json({ message: "Visualization not found" });
  const dashboard = await ownsDashboard(String(visual.dashboardId), req.userId);
  if (!dashboard) return res.status(403).json({ message: "Not authorized" });
  const copy = await Visualization.create({
    dashboardId: visual.dashboardId, datasetId: visual.datasetId, type: visual.type,
    title: `${visual.title} Copy`, xField: visual.xField, yField: visual.yField,
    aggregation: visual.aggregation, measureId: (visual as any).measureId || "", pageId: visual.pageId,
    position: { ...(visual.position as any), x: ((visual.position as any)?.x || 0) + 20, y: ((visual.position as any)?.y || 0) + 20 },
    style: visual.style
  });
  res.status(201).json(copy);
}

export async function deleteVisual(req: AuthRequest, res: Response) {
  const visual = await Visualization.findById(req.params.id);
  if (!visual) return res.status(404).json({ message: "Visualization not found" });
  const dashboard = await ownsDashboard(String(visual.dashboardId), req.userId);
  if (!dashboard) return res.status(403).json({ message: "Not authorized" });
  await visual.deleteOne();
  res.json({ message: "Visualization deleted" });
}
