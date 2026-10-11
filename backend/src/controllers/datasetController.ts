import { Response } from "express";
import fs from "fs";
import path from "path";
import { AuthRequest } from "../middleware/auth";
import Dataset from "../models/Dataset";
import Project from "../models/Project";
import ActivityLog from "../models/ActivityLog";
import Visualization from "../models/Visualization";
import { parseSpreadsheet } from "../services/fileService";
import { profileRows, recommendCharts } from "../utils/dataProfile";
import { env } from "../config/env";
import crypto from "crypto";
import { previewPreparation, PreparationOperation, HistoryItem, applyPreparation } from "../services/dataPreparationService";
import { applyCalculatedColumns, CalculatedColumn, CalculatedMeasure, Relationship, evaluateFormula, validateRelationshipCardinality } from "../services/semanticModelService";

export async function uploadDataset(req: AuthRequest, res: Response) {
  if (!req.file) return res.status(400).json({ message: "CSV or Excel file is required" });
  const project = await Project.findOne({ _id: req.body.projectId, ownerId: req.userId });
  if (!project) return res.status(404).json({ message: "Project not found" });
  try {
    const parsed = parseSpreadsheet(req.file.path);
    const p = profileRows(parsed.rows);
    if (!p.rows || !p.columns) throw new Error("The uploaded file contains no readable tabular data");
    const dataset = await Dataset.create({ projectId: project.id, ownerId: req.userId, originalName: req.file.originalname, storedName: req.file.filename, rows: p.rows, columns: p.columns, columnProfile: p.profile, sample: parsed.rows.slice(0, 100), selectedSheet: parsed.selectedSheetName || "", sourceSheets: parsed.sheets || [], ingestionWarnings: parsed.warnings || [] });
    await ActivityLog.create({ userId: req.userId, projectId: project.id, action: "dataset.uploaded", details: req.file.originalname });
    res.status(201).json({ dataset, recommendations: recommendCharts(p.profile), ingestion: { selectedSheet: parsed.selectedSheetName || "", sheets: parsed.sheets || [], warnings: parsed.warnings || [] } });
  } catch (e: any) {
    fs.unlink(req.file.path, () => undefined);
    return res.status(400).json({ message: e.message || "Unable to parse file" });
  }
}
export async function listDatasets(req: AuthRequest, res: Response) {
  res.json(await Dataset.find({ projectId: req.params.projectId, ownerId: req.userId }).sort({ createdAt: -1 }));
}
export async function getDataset(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  res.json(dataset);
}
export async function deleteDataset(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOneAndDelete({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  await Visualization.deleteMany({ datasetId: dataset.id });
  fs.unlink(path.resolve(process.cwd(), env.uploadDir, dataset.storedName), () => undefined);
  res.json({ message: "Dataset deleted" });
}

export async function changeDatasetSheet(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  const sheetName = String(req.body?.sheetName || "");
  if (!sheetName || !(dataset.sourceSheets || []).some((s: any) => s.name === sheetName)) return res.status(400).json({ message: "Choose a worksheet listed in this workbook." });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  try {
    const parsed = parseSpreadsheet(filePath, sheetName);
    if (!parsed.rows.length) return res.status(422).json({ message: "The selected worksheet contains no readable data rows." });
    const preparedRows = applyPreparation(parsed.rows, (dataset.preparationHistory || []) as HistoryItem[], parsed.selectedSheetName).rows;
    const p = profileRows(preparedRows);
    dataset.selectedSheet = parsed.selectedSheetName;
    dataset.rows = p.rows;
    dataset.columns = p.columns;
    dataset.columnProfile = p.profile as any;
    dataset.sample = preparedRows.slice(0, 100);
    dataset.ingestionWarnings = parsed.warnings;
    (dataset as any).activeSheetUpdatedAt = new Date();
    await dataset.save();
    await ActivityLog.create({ userId: req.userId, projectId: dataset.projectId, action: "dataset.sheet_changed", details: `${dataset.originalName}: ${sheetName}` });
    return res.json({ dataset, message: `Active worksheet changed to ${sheetName}. Existing preparation steps are retained in history; review them before applying them to this worksheet.` });
  } catch (e: any) {
    return res.status(400).json({ message: e.message || "Unable to read selected worksheet." });
  }
}

function validOperation(value: any): value is PreparationOperation {
  if (!value || typeof value !== "object" || typeof value.type !== "string") return false;
  if (value.type === "trim_text" || value.type === "drop_duplicate_rows") return true;
  if (value.type === "normalize_category") return typeof value.column === "string" && ["trim", "lowercase", "uppercase"].includes(value.mode);
  if (value.type === "replace_missing") return typeof value.column === "string" && ["string", "number", "boolean"].includes(typeof value.replacement);
  if (value.type === "convert_numeric" || value.type === "convert_date") return typeof value.column === "string";
  return false;
}
export async function previewDatasetPreparation(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  if (!validOperation(req.body?.operation)) return res.status(400).json({ message: "Unsupported preparation operation or invalid parameters." });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  const parsed = parseSpreadsheet(filePath, dataset.selectedSheet);
  if (req.body.operation.column && !Object.keys(parsed.rows[0] || {}).includes(req.body.operation.column)) return res.status(400).json({ message: "The selected column does not exist in the active worksheet." });
  return res.json(previewPreparation(parsed.rows, req.body.operation, (dataset.preparationHistory || []) as HistoryItem[], dataset.selectedSheet));
}
export async function applyDatasetPreparation(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  if (!validOperation(req.body?.operation)) return res.status(400).json({ message: "Unsupported preparation operation or invalid parameters." });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  const parsed = parseSpreadsheet(filePath, dataset.selectedSheet);
  if (req.body.operation.column && !Object.keys(parsed.rows[0] || {}).includes(req.body.operation.column)) return res.status(400).json({ message: "The selected column does not exist in the active worksheet." });
  const before = previewPreparation(parsed.rows, req.body.operation, (dataset.preparationHistory || []) as HistoryItem[], dataset.selectedSheet);
  const item: HistoryItem = { id: crypto.randomUUID(), operation: req.body.operation, active: true, createdAt: new Date().toISOString(), summary: `${req.body.operation.type}: ${before.affected} affected`, sheetName: dataset.selectedSheet };
  dataset.preparationHistory = [...(dataset.preparationHistory || []), item] as any;
  const preparedRows = applyPreparation(parsed.rows, dataset.preparationHistory as HistoryItem[], dataset.selectedSheet).rows;
  const profile = profileRows(preparedRows);
  dataset.rows = profile.rows; dataset.columns = profile.columns; dataset.columnProfile = profile.profile as any; dataset.sample = preparedRows.slice(0, 100);
  await dataset.save();
  await ActivityLog.create({ userId: req.userId, projectId: dataset.projectId, action: "dataset.preparation_applied", details: item.summary });
  return res.json({ history: dataset.preparationHistory, preview: before, message: "Preparation operation approved. The uploaded source file remains unchanged." });
}
export async function undoDatasetPreparation(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  const history = ((dataset.preparationHistory || []) as HistoryItem[]).map(x => ({ ...x }));
  const requestedId = String(req.body?.operationId || "");
  const targetIndex = requestedId ? history.findIndex(x => x.id === requestedId && x.active) : history.map(x => x.active).lastIndexOf(true);
  if (targetIndex < 0) return res.status(400).json({ message: "No active preparation operation was found to undo." });
  history[targetIndex].active = false;
  dataset.preparationHistory = history as any;
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  const parsed = parseSpreadsheet(filePath, dataset.selectedSheet);
  const preparedRows = applyPreparation(parsed.rows, history, dataset.selectedSheet).rows;
  const profile = profileRows(preparedRows);
  dataset.rows = profile.rows; dataset.columns = profile.columns; dataset.columnProfile = profile.profile as any; dataset.sample = preparedRows.slice(0, 100);
  await dataset.save();
  await ActivityLog.create({ userId: req.userId, projectId: dataset.projectId, action: "dataset.preparation_undone", details: history[targetIndex].summary });
  return res.json({ history: dataset.preparationHistory, message: "Operation deactivated. Original uploaded data was never modified." });
}


export async function saveSemanticModel(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  const columns = Array.isArray(req.body?.calculatedColumns) ? req.body.calculatedColumns : [];
  const measures = Array.isArray(req.body?.calculatedMeasures) ? req.body.calculatedMeasures : [];
  const relationships = Array.isArray(req.body?.relationships) ? req.body.relationships : [];
  if (columns.length > 50 || measures.length > 50 || relationships.length > 30) return res.status(400).json({ message: "Semantic model limit exceeded (50 calculated columns, 50 measures, 30 relationships)." });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  const sheetNames: string[] = (dataset.sourceSheets || []).map((s: any) => String(s.name));
  const knownSheets = new Set(sheetNames);
  const sourceColumns = new Map<string, Set<string>>();
  for (const sheetName of sheetNames) sourceColumns.set(sheetName, new Set(Object.keys(parseSpreadsheet(filePath, sheetName).rows[0] || {})));
  const formulaFields = (formula: string) => Array.from(formula.matchAll(/\[([^\]]+)\]/g)).map(match => String(match[1]).trim());
  const fieldExists = (field: string, baseSheet: string) => sourceColumns.get(baseSheet)?.has(field) || sheetNames.some((sheetName: string) => sourceColumns.get(sheetName)?.has(field.replace(`${sheetName}.`, "")) && field.startsWith(`${sheetName}.`));
  const normalizedColumns: CalculatedColumn[] = [];
  const names = new Set<string>();
  try {
    for (const raw of columns) {
      const name = String(raw?.name || "").trim(); const formula = String(raw?.formula || "").trim(); const sheetName = String(raw?.sheetName || dataset.selectedSheet || "");
      if (!name || !formula || formula.length > 500 || !knownSheets.has(sheetName)) throw new Error("Each calculated column needs a name, formula (maximum 500 characters), and valid worksheet.");
      if (names.has(`${sheetName}:${name.toLowerCase()}`)) throw new Error(`Duplicate calculated column name: ${name}`);
      const parsed = parseSpreadsheet(filePath, sheetName);
      if (Object.prototype.hasOwnProperty.call(parsed.rows[0] || {}, name)) throw new Error(`Calculated column name already exists in source data: ${name}`);
      for (const field of formulaFields(formula)) { if (field.includes(".")) throw new Error(`Calculated column ${name} must use columns from its own worksheet; cross-worksheet formulas belong in calculated measures. Invalid reference: ${field}`); if (!sourceColumns.get(sheetName)?.has(field) && !normalizedColumns.some(existing => existing.sheetName === sheetName && existing.name === field && existing.active)) throw new Error(`Formula references an unknown column on ${sheetName}: ${field}`); }
      const definition: CalculatedColumn = { id: String(raw.id || crypto.randomUUID()), name, formula, sheetName, active: raw.active !== false, createdAt: String(raw.createdAt || new Date().toISOString()) };
      if (definition.active) applyCalculatedColumns(parsed.rows.slice(0, 5), [...normalizedColumns, definition], sheetName);
      normalizedColumns.push(definition); names.add(`${sheetName}:${name.toLowerCase()}`);
    }
    const normalizedMeasures: CalculatedMeasure[] = measures.map((raw: any) => {
      const name = String(raw?.name || "").trim(); const formula = String(raw?.formula || "").trim();
      if (!name || !formula || formula.length > 500) throw new Error("Each measure needs a name and a formula (maximum 500 characters).");
      const def: CalculatedMeasure = { id: String(raw.id || crypto.randomUUID()), name, formula, format: ["number", "percentage", "currency"].includes(raw.format) ? raw.format : "number", active: raw.active !== false, createdAt: String(raw.createdAt || new Date().toISOString()) };
      for (const field of formulaFields(formula)) if (!fieldExists(field, dataset.selectedSheet) && !normalizedColumns.some(column => column.active && (column.name === field || `${column.sheetName}.${column.name}` === field))) throw new Error(`Measure references an unknown column: ${field}`);
      if (def.active) evaluateFormula(def.formula, {}, parseSpreadsheet(filePath, dataset.selectedSheet).rows.slice(0, 10), true);
      return def;
    });
    const normalizedRelationships: Relationship[] = [];
    for (const raw of relationships) {
      const leftSheet = String(raw?.leftSheet || ""); const rightSheet = String(raw?.rightSheet || ""); const leftKey = String(raw?.leftKey || ""); const rightKey = String(raw?.rightKey || "");
      if (!knownSheets.has(leftSheet) || !knownSheets.has(rightSheet) || leftSheet === rightSheet || !leftKey || !rightKey) throw new Error("Each relationship must connect two different valid worksheets using a key column on each side.");
      const leftRows = parseSpreadsheet(filePath, leftSheet).rows; const rightRows = parseSpreadsheet(filePath, rightSheet).rows;
      if (!Object.prototype.hasOwnProperty.call(leftRows[0] || {}, leftKey) || !Object.prototype.hasOwnProperty.call(rightRows[0] || {}, rightKey)) throw new Error(`Relationship key not found: ${leftSheet}.${leftKey} or ${rightSheet}.${rightKey}`);
      const cardinality = ["many-to-one", "one-to-many", "one-to-one", "many-to-many"].includes(raw.cardinality) ? raw.cardinality : "many-to-one";
      const relationship: Relationship = { id: String(raw.id || crypto.randomUUID()), leftSheet, leftKey, rightSheet, rightKey, joinType: raw.joinType === "inner" ? "inner" : "left", cardinality, active: raw.active !== false, createdAt: String(raw.createdAt || new Date().toISOString()) };
      if (relationship.active) validateRelationshipCardinality(leftRows, rightRows, relationship);
      normalizedRelationships.push(relationship);
    }
    // Reject parallel active edges and cycles at save time rather than failing later during chart rendering.
    const activePairs = new Set<string>();
    const adjacency = new Map<string, string[]>();
    for (const rel of normalizedRelationships.filter(r => r.active)) {
      const pair = [rel.leftSheet, rel.rightSheet].sort().join("\u0000");
      if (activePairs.has(pair)) throw new Error(`Only one active relationship is supported between ${rel.leftSheet} and ${rel.rightSheet}.`);
      activePairs.add(pair);
      adjacency.set(rel.leftSheet, [...(adjacency.get(rel.leftSheet) || []), rel.rightSheet]);
      adjacency.set(rel.rightSheet, [...(adjacency.get(rel.rightSheet) || []), rel.leftSheet]);
    }
    const visitedSheets = new Set<string>();
    const walk = (sheet: string, parent: string | null) => {
      visitedSheets.add(sheet);
      for (const next of adjacency.get(sheet) || []) {
        if (next === parent) continue;
        if (visitedSheets.has(next)) throw new Error(`Relationship cycle detected through ${sheet} and ${next}. Remove the redundant relationship to keep one unambiguous join path.`);
        walk(next, sheet);
      }
    };
    for (const sheet of sheetNames) if (!visitedSheets.has(sheet)) walk(sheet, null);

    // Measures may reference the selected worksheet and worksheets reachable through the active relationship graph only.
    const reachableSheets = new Set<string>([String(dataset.selectedSheet || sheetNames[0] || "")]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const rel of normalizedRelationships.filter(r => r.active)) {
        if (reachableSheets.has(rel.leftSheet) && !reachableSheets.has(rel.rightSheet)) { reachableSheets.add(rel.rightSheet); expanded = true; }
        if (reachableSheets.has(rel.rightSheet) && !reachableSheets.has(rel.leftSheet)) { reachableSheets.add(rel.leftSheet); expanded = true; }
      }
    }
    for (const measure of normalizedMeasures.filter(m => m.active)) {
      if (!/\b(SUM|AVG|AVERAGE|COUNT|MIN|MAX)\s*\(/i.test(measure.formula)) throw new Error(`Measure "${measure.name}" must use an aggregate function such as SUM([Revenue]) or COUNT([Order ID]).`);
      for (const field of formulaFields(measure.formula)) {
        const dot = field.indexOf(".");
        if (dot >= 0) {
          const sheetName = field.slice(0, dot); const columnName = field.slice(dot + 1);
          if (!reachableSheets.has(sheetName)) throw new Error(`Measure "${measure.name}" references worksheet "${sheetName}" which is not reachable from the selected worksheet through active relationships.`);
          const calculatedExists = normalizedColumns.some(c => c.active && c.sheetName === sheetName && c.name === columnName);
          if (!sourceColumns.get(sheetName)?.has(columnName) && !calculatedExists) throw new Error(`Measure "${measure.name}" references unknown field ${field}.`);
        } else if (!sourceColumns.get(String(dataset.selectedSheet || ""))?.has(field) && !normalizedColumns.some(c => c.active && c.sheetName === dataset.selectedSheet && c.name === field)) {
          throw new Error(`Measure "${measure.name}" references unknown field on the selected worksheet: ${field}. Use [Worksheet.Column] for a related worksheet field.`);
        }
      }
    }
    dataset.calculatedColumns = normalizedColumns as any; dataset.calculatedMeasures = normalizedMeasures as any; dataset.relationships = normalizedRelationships as any;
    await dataset.save();
    await ActivityLog.create({ userId: req.userId, projectId: dataset.projectId, action: "dataset.semantic_model_saved", details: `${normalizedColumns.length} calculated columns, ${normalizedMeasures.length} measures, ${normalizedRelationships.length} relationships` });
    return res.json({ calculatedColumns: dataset.calculatedColumns, calculatedMeasures: dataset.calculatedMeasures, relationships: dataset.relationships, message: "Semantic model saved. Formulas are evaluated by the server using the supported safe arithmetic grammar." });
  } catch (error: any) { return res.status(400).json({ message: error.message || "Unable to save semantic model." }); }
}

export async function getSheetColumns(req: AuthRequest, res: Response) {
  const dataset = await Dataset.findOne({ _id: req.params.id, ownerId: req.userId });
  if (!dataset) return res.status(404).json({ message: "Dataset not found" });
  const sheetName = String(req.params.sheetName || "");
  if (!(dataset.sourceSheets || []).some((sheet: any) => sheet.name === sheetName)) return res.status(400).json({ message: "Worksheet not found in this workbook." });
  const filePath = path.resolve(process.cwd(), env.uploadDir, dataset.storedName);
  const parsed = parseSpreadsheet(filePath, sheetName);
  return res.json({ sheetName: parsed.selectedSheetName, columns: Object.keys(parsed.rows[0] || {}) });
}
