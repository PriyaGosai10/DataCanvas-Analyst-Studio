import { parseSpreadsheet } from "./fileService";
import { parseNumeric } from "../engine/sanitizer";
import { applyPreparation, HistoryItem } from "./dataPreparationService";
import { applyCalculatedColumns, CalculatedColumn, CalculatedMeasure, Relationship, loadRelatedRows, evaluateMeasure, collectSourceRows } from "./semanticModelService";

export function queryRows(filePath: string, opts: { search?: string; limit?: number; offset?: number; filters?: Record<string, any>; selectedSheet?: string; preparationHistory?: HistoryItem[]; calculatedColumns?: CalculatedColumn[]; relationships?: Relationship[] } = {}) {
  let rows = opts.relationships?.some(r => r.active && (r.leftSheet === opts.selectedSheet || r.rightSheet === opts.selectedSheet))
    ? loadRelatedRows(filePath, opts.selectedSheet || "", opts.preparationHistory || [], opts.relationships, opts.calculatedColumns || []).rows
    : applyPreparation(parseSpreadsheet(filePath, opts.selectedSheet).rows, opts.preparationHistory || [], opts.selectedSheet).rows;
  if (!opts.relationships?.some(r => r.active && (r.leftSheet === opts.selectedSheet || r.rightSheet === opts.selectedSheet))) rows = applyCalculatedColumns(rows, opts.calculatedColumns || [], opts.selectedSheet);
  const search = String(opts.search || "").trim().toLowerCase();
  if (search) rows = rows.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(search)));
  if (opts.filters) rows = rows.filter(r => Object.entries(opts.filters!).every(([key, value]) => value === "" || value === undefined || String(r[key] ?? "") === String(value)));
  const total = rows.length;
  const visibleRows = rows.slice(Math.max(0, Number(opts.offset || 0)), Math.max(0, Number(opts.offset || 0)) + Math.min(5000, Math.max(1, Number(opts.limit || 100)))).map(row => { const clean = { ...row }; delete (clean as any).__sourceRows; if (opts.selectedSheet) for (const key of Object.keys(clean)) if (key.startsWith(`${opts.selectedSheet}.`)) delete (clean as any)[key]; return clean; });
  const offset = Math.max(0, Number(opts.offset || 0));
  const limit = Math.min(5000, Math.max(1, Number(opts.limit || 100)));
  return { total, rows: visibleRows.slice(0, limit) };
}

export function aggregateRows(filePath: string, xField?: string, yField?: string, aggregation = "sum", filters: Record<string, any> = {}, type = "bar", topN = 100, overflow = "paginate", selectedSheet?: string, preparationHistory: HistoryItem[] = [], calculatedColumns: CalculatedColumn[] = [], relationships: Relationship[] = [], measure?: CalculatedMeasure) {
  // Aggregations must use the complete filtered source, not the paginated explorer window.
  const sourceRows = relationships.some(r => r.active && (r.leftSheet === selectedSheet || r.rightSheet === selectedSheet))
    ? loadRelatedRows(filePath, selectedSheet || "", preparationHistory, relationships, calculatedColumns).rows
    : applyPreparation(parseSpreadsheet(filePath, selectedSheet).rows.map((row, index) => ({ ...row, __sourceRows: [{ worksheet: selectedSheet || "Active worksheet", rowNumber: index + 2 }] })), preparationHistory, selectedSheet).rows;
  if (!relationships.some(r => r.active && (r.leftSheet === selectedSheet || r.rightSheet === selectedSheet))) {
    applyCalculatedColumns(sourceRows, calculatedColumns, selectedSheet);
    if (selectedSheet) for (const row of sourceRows) for (const [column, value] of Object.entries({ ...row })) if (column !== "__sourceRows") row[`${selectedSheet}.${column}`] = value;
  }
  const rows = Object.keys(filters || {}).length
    ? sourceRows.filter(row => Object.entries(filters).every(([key, value]) => value === "" || value === undefined || String(row[key] ?? "") === String(value)))
    : sourceRows;
  if (measure?.active) {
    if (!xField) return [{ name: measure.name, value: evaluateMeasure(rows, measure), sourceRowCount: collectSourceRows(rows).length, sourceRows: collectSourceRows(rows) }].filter(item => item.value !== null);
    const grouped = new Map<string, Record<string, any>[]>();
    for (const row of rows) { const raw = row[xField]; const key = raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw.toISOString().slice(0,10) : String(raw ?? "Unknown").trim() || "(Blank)"; const bucket = grouped.get(key) || []; bucket.push(row); grouped.set(key, bucket); }
    const result = Array.from(grouped.entries()).map(([name, groupRows]) => ({ name, value: evaluateMeasure(groupRows, measure), sourceRowCount: collectSourceRows(groupRows).length, sourceRows: collectSourceRows(groupRows) })).filter(item => item.value !== null) as {name:string;value:number;sourceRowCount:number;sourceRows:any[]}[];
    if ((type === "line" || type === "area") && xField) result.sort((a,b) => { const ta=Date.parse(a.name),tb=Date.parse(b.name); return Number.isFinite(ta)&&Number.isFinite(tb)?ta-tb:a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}); });
    return result.slice(0,500);
  }
  if (type === "kpi") {
    const nums = rows.map(r => parseNumeric(r[yField || ""])).filter((v): v is number => v !== null);
    if (!nums.length) return [];
    const total = nums.reduce((a, b) => a + b, 0);
    const value = aggregation === "avg" ? total / nums.length : aggregation === "min" ? Math.min(...nums) : aggregation === "max" ? Math.max(...nums) : aggregation === "count" ? rows.length : total;
    return [{ name: "Value", value: Math.round(value * 100) / 100, sourceRowCount: collectSourceRows(rows).length, sourceRows: collectSourceRows(rows) }];
  }
  const groups = new Map<string, { total: number; count: number; min: number; max: number; rows: Record<string, any>[] }>();
  for (const row of rows) {
    const rawKey = row[xField || ""];
    const key = rawKey instanceof Date && !Number.isNaN(rawKey.getTime()) ? rawKey.toISOString().slice(0, 10) : String(rawKey ?? "Unknown").trim() || "(Blank)";
    const existing = groups.get(key) || { total: 0, count: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, rows: [] };
    existing.rows.push(row);
    const n = yField ? parseNumeric(row[yField]) : 1;
    // Keep category counts for count aggregation, but do not turn invalid/missing measures into zero.
    if (aggregation === "count") existing.count += 1;
    else if (n !== null) { existing.total += n; existing.min = Math.min(existing.min, n); existing.max = Math.max(existing.max, n); existing.count += 1; }
    groups.set(key, existing);
  }
  const result = Array.from(groups.entries()).map(([name, g]) => ({
    name,
    sourceRowCount: collectSourceRows(g.rows).length,
    sourceRows: collectSourceRows(g.rows),
    value: aggregation === "count" ? g.count : g.count === 0 ? null : aggregation === "avg" ? g.total / g.count : aggregation === "min" ? (Number.isFinite(g.min) ? g.min : null) : aggregation === "max" ? (Number.isFinite(g.max) ? g.max : null) : g.total
  })).filter(item => item.value !== null);
  // Trends must preserve chronological order; sorting them by magnitude creates a misleading line.
  if (type === "line" || type === "area") {
    result.sort((a, b) => {
      const ta = Date.parse(a.name), tb = Date.parse(b.name);
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    return result.slice(0, 500).map(v => ({ ...v, value: Math.round(Number(v.value) * 100) / 100 }));
  }
  result.sort((a,b) => Number(b.value) - Number(a.value));
  const limit = Math.min(500, Math.max(1, Number(topN) || 100));
  if (overflow === "truncate_others" && result.length > limit) {
    const head = result.slice(0, Math.max(1, limit - 1));
    const rest = result.slice(Math.max(1, limit - 1));
    const otherValue = rest.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const otherRefs = collectSourceRows(rest.map(item => ({ __sourceRows: item.sourceRows })));
    head.push({ name: "Others", value: otherValue, sourceRowCount: otherRefs.length, sourceRows: otherRefs });
    return head.map(v => ({ ...v, value: Math.round(Number(v.value) * 100) / 100 }));
  }
  return result.slice(0, limit).map(v => ({ ...v, value: Math.round(Number(v.value) * 100) / 100 }));
}
