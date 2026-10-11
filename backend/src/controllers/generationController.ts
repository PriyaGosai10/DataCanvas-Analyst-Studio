import path from "path";
import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import Dashboard from "../models/Dashboard";
import Dataset from "../models/Dataset";
import Visualization from "../models/Visualization";
import ActivityLog from "../models/ActivityLog";
import { env } from "../config/env";
import { parseSpreadsheet } from "../services/fileService";
import { applyPreparation, HistoryItem } from "../services/dataPreparationService";
import { applyCalculatedColumns, CalculatedColumn, CalculatedMeasure, Relationship, loadRelatedRows } from "../services/semanticModelService";
import { buildDashboardBlueprint } from "../engine/pipeline";
import { GenerationOptions } from "../engine/types";

const allowedThemes = new Set(["light", "dark"]);
const allowedColors = new Set(["#2563eb", "#7c3aed", "#0f766e", "#ea580c", "#db2777", "#0891b2", "#65a30d", "#ca8a04", "#0f172a", "#0d9488"]);

export async function generateDashboard(req: AuthRequest, res: Response) {
  const dashboard = await Dashboard.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dashboard) return res.status(404).json({ message: "Dashboard not found" });
  const dataset = await Dataset.findOne({ _id: req.body.datasetId, ownerId: req.userId, projectId: dashboard.projectId });
  if (!dataset) return res.status(404).json({ message: "Choose a dataset belonging to this project." });

  const pageId = String(req.body.pageId || "page-1").slice(0, 80);
  const mode: "auto" | "guided" = req.body.mode === "guided" ? "guided" : "auto";
  const rawOptions = req.body.options && typeof req.body.options === "object" ? req.body.options : {};
  const options: GenerationOptions = {
    mode,
    purpose: rawOptions.purpose === "exploration" || rawOptions.purpose === "insights" ? rawOptions.purpose : "executive",
    title: typeof rawOptions.title === "string" ? rawOptions.title.slice(0, 120) : undefined,
    theme: allowedThemes.has(rawOptions.theme) ? rawOptions.theme : (dashboard.theme === "dark" ? "dark" : "light"),
    primaryColor: allowedColors.has(rawOptions.primaryColor) ? rawOptions.primaryColor : undefined,
    fontFamily: typeof rawOptions.fontFamily === "string" && rawOptions.fontFamily.length < 120 ? rawOptions.fontFamily : undefined,
    pinnedFields: Array.isArray(rawOptions.pinnedFields) ? rawOptions.pinnedFields.filter((x: unknown): x is string => typeof x === "string").slice(0, 10) : [],
    excludedFields: Array.isArray(rawOptions.excludedFields) ? rawOptions.excludedFields.filter((x: unknown): x is string => typeof x === "string").slice(0, 100) : [],
    maxVisuals: Math.min(7, Math.max(1, Number(rawOptions.maxVisuals) || 7)),
    variantIndex: Math.max(0, Math.min(2, Number(rawOptions.variantIndex) || 0)),
    generationKey: typeof rawOptions.generationKey === "string" ? rawOptions.generationKey.slice(0, 80) : "initial"
  };

  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  const parsed = parseSpreadsheet(filePath, dataset.selectedSheet);
  const preparedRows = ((dataset.relationships || []) as Relationship[]).some(r => r.active && (r.leftSheet === dataset.selectedSheet || r.rightSheet === dataset.selectedSheet)) ? loadRelatedRows(filePath, dataset.selectedSheet, (dataset.preparationHistory || []) as HistoryItem[], (dataset.relationships || []) as Relationship[], (dataset.calculatedColumns || []) as CalculatedColumn[]).rows : applyPreparation(parsed.rows, (dataset.preparationHistory || []) as HistoryItem[], dataset.selectedSheet).rows;
  if (!((dataset.relationships || []) as Relationship[]).some(r => r.active && (r.leftSheet === dataset.selectedSheet || r.rightSheet === dataset.selectedSheet))) applyCalculatedColumns(preparedRows, (dataset.calculatedColumns || []) as CalculatedColumn[], dataset.selectedSheet);
  for (const row of preparedRows) for (const key of Object.keys(row)) if (key.startsWith(`${dataset.selectedSheet}.`)) delete row[key];
  if (!preparedRows.length) return res.status(422).json({ message: "The uploaded dataset contains no usable data rows after approved preparation steps." });
  const { blueprint, sanitized } = buildDashboardBlueprint(preparedRows, String(dashboard._id), options, Object.keys(preparedRows[0] || {}));
  const chartColors = [blueprint.designTokens.palette.primary, blueprint.designTokens.palette.accent, blueprint.designTokens.palette.secondary];
  const activeMeasures = ((dataset.calculatedMeasures || []) as CalculatedMeasure[]).filter(measure => measure.active);
  const pageVisuals = blueprint.visualManifest.visuals.map((visual, index) => {
    const grid = blueprint.gridLayout.lg.find(item => item.id === visual.id);
    const generatedWidth = options.purpose === "executive"
      ? (visual.type === "kpi" ? 3 : visual.type === "line" || visual.type === "area" ? 12 : 6)
      : options.purpose === "exploration"
        ? (visual.type === "kpi" ? 4 : visual.type === "donut" || visual.type === "pie" ? 4 : 6)
        : (visual.type === "kpi" ? 4 : visual.type === "bar" ? 6 : 12);
    return {
      dashboardId: dashboard._id,
      datasetId: dataset._id,
      type: visual.type,
      title: visual.title,
      xField: visual.encodings.x || "",
      yField: visual.datasetField || visual.encodings.y || "",
      aggregation: visual.aggregation,
      measureId: visual.type === "kpi" && activeMeasures.some(measure => measure.id === visual.metricId) ? visual.metricId : "",
      pageId,
      position: { x: grid?.x ?? 0, y: grid?.y ?? 0, width: generatedWidth, height: grid?.h ?? 3, order: index },
      style: { color: chartColors[index % chartColors.length], measureFormat: visual.type === "kpi" && activeMeasures[0] ? activeMeasures[0].format : undefined, designTokensId: blueprint.designTokens.id, intent: visual.intent, overflow: visual.overflow, encodings: visual.encodings, metricId: visual.metricId, interactionRole: visual.interactionRole }
    };
  });

  await Visualization.deleteMany({ dashboardId: dashboard._id, pageId });
  const created = await Visualization.insertMany(pageVisuals);
  (dashboard as any).blueprint = blueprint;
  dashboard.theme = options.theme || "light";
  await dashboard.save();
  await ActivityLog.create({ userId: req.userId, projectId: dashboard.projectId, action: "dashboard.generated", details: `${dataset.originalName}: ${created.length} visuals (${mode})` });
  return res.json({ blueprint, visuals: created, sanitizer: { rowCount: sanitized.rowCount, warnings: sanitized.warnings }, message: `Generated ${created.length} visuals from ${sanitized.rowCount} rows.` });
}
