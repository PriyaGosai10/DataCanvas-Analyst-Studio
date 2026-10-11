import { Response } from "express";
import path from "path";
import Dataset from "../models/Dataset";
import { AuthRequest } from "../middleware/auth";
import { env } from "../config/env";
import { queryRows, aggregateRows } from "../services/analyticsService";
import { parseSpreadsheet } from "../services/fileService";
import { buildDataInsights } from "../services/insightService";
import { applyPreparation, HistoryItem } from "../services/dataPreparationService";
import { CalculatedColumn, CalculatedMeasure, Relationship, loadRelatedRows, applyCalculatedColumns } from "../services/semanticModelService";

function csvEscape(value: any) { const s = String(value ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

export async function dataRows(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  res.json(queryRows(filePath, { search: req.body?.search, limit: req.body?.limit, offset: req.body?.offset, filters: req.body?.filters || {}, selectedSheet: dataset.selectedSheet, preparationHistory: (dataset.preparationHistory || []) as HistoryItem[], calculatedColumns: (dataset.calculatedColumns || []) as CalculatedColumn[], relationships: (dataset.relationships || []) as Relationship[] }));
}

export async function aggregate(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  if (!req.body?.xField && req.body?.type !== "kpi" && req.body?.type !== "measure") return res.status(400).json({ message: "xField is required" });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  const measure = req.body?.measureId ? ((dataset.calculatedMeasures || []) as CalculatedMeasure[]).find(m => m.id === String(req.body.measureId) && m.active) : undefined;
  if (req.body?.type === "measure" && !measure) return res.status(400).json({ message: "Choose an active calculated measure." });
  const data = aggregateRows(filePath, req.body.xField, req.body.yField, req.body.aggregation || "sum", req.body.filters || {}, req.body.type || "bar", req.body.topN || 100, req.body.overflow || "paginate", dataset.selectedSheet, (dataset.preparationHistory || []) as HistoryItem[], (dataset.calculatedColumns || []) as CalculatedColumn[], (dataset.relationships || []) as Relationship[], measure);
  res.json({ data, lineage: { datasetId: dataset.id, sourceWorksheet: dataset.selectedSheet, joinedWorksheets: data.length ? Array.from(new Set(data.flatMap((item: any) => (item.sourceRows || []).map((ref: any) => ref.worksheet)).filter((sheet: string) => sheet !== dataset.selectedSheet))) : [], sourceRowReferences: Array.from(new Map(data.flatMap((item: any) => item.sourceRows || []).map((ref: any) => [`${ref.worksheet}:${ref.rowNumber}`, ref])).values()), rowCountAfterFilters: queryRows(filePath, { limit: 1, filters: req.body.filters || {}, selectedSheet: dataset.selectedSheet, preparationHistory: (dataset.preparationHistory || []) as HistoryItem[], calculatedColumns: (dataset.calculatedColumns || []) as CalculatedColumn[], relationships: (dataset.relationships || []) as Relationship[] }).total, filters: req.body.filters || {}, xField: req.body.xField || null, yField: req.body.yField || null, aggregation: req.body.type === "measure" ? measure?.formula : (req.body.aggregation || "sum"), calculatedColumnNames: ((dataset.calculatedColumns || []) as CalculatedColumn[]).filter(c => c.active).map(c => c.name) } });
}

export async function exportCsv(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  let rows = ((dataset.relationships || []) as Relationship[]).some(r => r.active && (r.leftSheet === dataset.selectedSheet || r.rightSheet === dataset.selectedSheet)) ? loadRelatedRows(filePath, dataset.selectedSheet, (dataset.preparationHistory || []) as HistoryItem[], (dataset.relationships || []) as Relationship[], (dataset.calculatedColumns || []) as CalculatedColumn[]).rows : applyPreparation(parseSpreadsheet(filePath, dataset.selectedSheet).rows, (dataset.preparationHistory || []) as HistoryItem[], dataset.selectedSheet).rows;
  if (!((dataset.relationships || []) as Relationship[]).some(r => r.active && (r.leftSheet === dataset.selectedSheet || r.rightSheet === dataset.selectedSheet))) applyCalculatedColumns(rows, (dataset.calculatedColumns || []) as CalculatedColumn[], dataset.selectedSheet);
  let exportFilters: Record<string, any> = {};
  try { if (req.query.filters) exportFilters = JSON.parse(String(req.query.filters)); } catch { return res.status(400).json({ message: "Invalid export filters JSON." }); }
  const search = String(req.query.search || "").trim().toLowerCase();
  rows = rows.filter(row => Object.entries(exportFilters).every(([key, value]) => value === "" || value === undefined || String(row[key] ?? "") === String(value)));
  if (search) rows = rows.filter(row => Object.values(row).some(value => String(value ?? "").toLowerCase().includes(search)));
  const headers = (rows.length ? Object.keys(rows[0]) : Object.keys(parseSpreadsheet(filePath, dataset.selectedSheet).rows[0] || {})).filter(key => key !== "__sourceRows" && !key.startsWith(`${dataset.selectedSheet}.`));
  const csv = [headers.map(csvEscape).join(","), ...rows.map(r => headers.map(h => csvEscape(r[h])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${dataset.originalName.replace(/\.[^.]+$/, "")}.csv"`);
  res.send(csv);
}


export async function dataInsights(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  res.json(buildDataInsights(filePath, req.body?.filters || (req.query?.filters ? JSON.parse(String(req.query.filters)) : {}), dataset.selectedSheet, (dataset.preparationHistory || []) as HistoryItem[], (dataset.calculatedColumns || []) as CalculatedColumn[], (dataset.relationships || []) as Relationship[], (dataset.calculatedMeasures || []) as CalculatedMeasure[]));
}
