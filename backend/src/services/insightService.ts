import { parseSpreadsheet } from "./fileService";
import { applyPreparation, HistoryItem } from "./dataPreparationService";
import { CalculatedColumn, CalculatedMeasure, Relationship, applyCalculatedColumns, evaluateMeasure, loadRelatedRows } from "./semanticModelService";

type Row = Record<string, any>;
function numberOf(value: any): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value instanceof Date) return null;
  let s = String(value).trim();
  if (!s || /^(n\/?a|na|null|undefined|-)$/i.test(s)) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/^\((.*)\)$/, "$1").replace(/[,$€£₹¥%\s]/g, "").replace(/^[^0-9+.\-]+|[^0-9.]+$/g, "");
  if (!s || !/[0-9]/.test(s)) return null;
  const n = Number(s); return Number.isFinite(n) ? (negative ? -Math.abs(n) : n) : null;
}
function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function quantile(sorted: number[], q: number) { if (!sorted.length) return 0; const i = (sorted.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
export function buildDataInsights(filePath: string, filters: Record<string, any> = {}, selectedSheet?: string, history: HistoryItem[] = [], calculatedColumns: CalculatedColumn[] = [], relationships: Relationship[] = [], calculatedMeasures: CalculatedMeasure[] = []) {
  const parsed = parseSpreadsheet(filePath, selectedSheet);
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value !== null && value !== undefined));
  const hasRelationships = relationships.some(r => r.active && (r.leftSheet === selectedSheet || r.rightSheet === selectedSheet));
  const related = hasRelationships ? loadRelatedRows(filePath, selectedSheet || parsed.selectedSheetName, history, relationships, calculatedColumns) : null;
  const prepared = related ? related.rows : applyCalculatedColumns(applyPreparation(parsed.rows, history, selectedSheet).rows, calculatedColumns, selectedSheet);
  const rows: Row[] = prepared.filter(row => Object.entries(activeFilters).every(([key, value]) => String(row[key] ?? "") === String(value))).map(row => { const clean = { ...row }; delete clean.__sourceRows; if (selectedSheet) for (const key of Object.keys(clean)) if (key.startsWith(`${selectedSheet}.`)) delete clean[key]; return clean; });
  const headers = Object.keys(rows[0] || {}).filter(name => name !== "__sourceRows");
  const columns = headers.map(name => {
    const values = rows.map(r => r[name]);
    const present = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
    const nums = present.map(numberOf).filter((v): v is number => v !== null);
    const unique = new Set(present.map(v => v instanceof Date ? v.toISOString() : String(v).trim())).size;
    const numeric = present.length > 0 && nums.length / present.length >= 0.8;
    const dateLike = present.length > 0 && /date|time|month|year|period/i.test(name) && present.filter(v => !Number.isNaN(Date.parse(String(v)))).length / present.length >= 0.7;
    const sorted = [...nums].sort((a,b)=>a-b);
    return { name, type: !present.length ? "empty" : dateLike ? "date" : numeric ? "numeric" : unique <= Math.min(20, Math.max(2, Math.ceil(rows.length * 0.5))) ? "category" : "text", nonEmpty: present.length, missing: values.length - present.length, missingPercent: values.length ? Math.round((values.length-present.length)/values.length*10000)/100 : 0, unique, ...(numeric && nums.length ? { min: sorted[0], max: sorted[sorted.length-1], mean: nums.reduce((a,b)=>a+b,0)/nums.length, median: quantile(sorted,.5), q1: quantile(sorted,.25), q3: quantile(sorted,.75), sum: nums.reduce((a,b)=>a+b,0), validNumeric: nums.length } : {}) };
  });
  const numericColumns = columns.filter(c => c.type === "numeric" && c.unique > 1).slice(0, 12);
  const categoryColumns = columns.filter(c => c.type === "category").slice(0, 8);
  const qualityIssues = columns.filter(c => c.missing > 0).sort((a,b)=>b.missing-a.missing).slice(0,8).map(c => ({ severity: c.missingPercent >= 20 ? "high" : c.missingPercent >= 5 ? "medium" : "low", title: `${c.name} has missing values`, evidence: `${c.missing.toLocaleString()} of ${rows.length.toLocaleString()} rows are blank (${c.missingPercent}%).`, recommendation: "Review missingness before relying on this field for comparisons." }));
  for (const header of headers) {
    const values = rows.map(r => r[header]).filter(v => v !== null && v !== undefined && String(v).trim() !== "");
    if (/date|time|month|year|period/i.test(header) && values.length) {
      const invalid = values.filter(v => !(v instanceof Date) && !Number.isFinite(Date.parse(String(v))));
      if (invalid.length) qualityIssues.push({ severity: invalid.length / values.length >= 0.2 ? "high" : "medium", title: `${header} contains invalid date candidates`, evidence: `${invalid.length.toLocaleString()} of ${values.length.toLocaleString()} populated values cannot be parsed as dates.`, recommendation: "Preview date conversion and inspect the invalid source values before approving a transformation." });
    }
    const categoryLike = values.length > 0 && values.some(v => typeof v === "string") && !/date|time|month|year|period/i.test(header);
    if (categoryLike) {
      const variants = new Map<string, Set<string>>();
      for (const value of values) if (typeof value === "string") {
        const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
        if (!variants.has(normalized)) variants.set(normalized, new Set());
        variants.get(normalized)!.add(value);
      }
      const groups = [...variants.values()].filter(group => group.size > 1);
      if (groups.length) qualityIssues.push({ severity: groups.length >= 5 ? "medium" : "low", title: `${header} may contain inconsistent category labels`, evidence: `${groups.length} case/whitespace variant group(s) appear to represent the same normalized label.`, recommendation: "Review category normalization preview; only apply changes if those labels are semantically equivalent." });
    }
  }
  const duplicateKeys = new Set<string>(); let duplicates = 0;
  for (const row of rows) { const key = JSON.stringify(headers.map(h => row[h] instanceof Date ? row[h].toISOString() : row[h] ?? null)); if (duplicateKeys.has(key)) duplicates++; else duplicateKeys.add(key); }
  if (duplicates) qualityIssues.push({ severity: duplicates / Math.max(rows.length,1) > .05 ? "high" : "medium", title: "Potential duplicate records detected", evidence: `${duplicates.toLocaleString()} rows repeat an earlier complete-row signature.`, recommendation: "Inspect duplicates; they have not been removed." });
  const findings: any[] = [];
  for (const c of numericColumns) {
    const values = rows.map(r => numberOf(r[c.name])).filter((v): v is number => v !== null);
    if (!values.length) continue;
    const sorted = [...values].sort((a,b)=>a-b), q1 = quantile(sorted,.25), q3 = quantile(sorted,.75), iqr = q3-q1;
    const outliers = iqr > 0 ? values.filter(v => v < q1 - 1.5*iqr || v > q3 + 1.5*iqr).length : 0;
    if (outliers > 0) findings.push({ type: "statistical_observation", priority: outliers / values.length >= .05 ? "high" : "medium", title: `${c.name}: potential outliers`, evidence: `${outliers.toLocaleString()} of ${values.length.toLocaleString()} valid numeric values fall outside the 1.5×IQR fences (${fmt(q1-1.5*iqr)} to ${fmt(q3+1.5*iqr)}).`, recommendation: "Review source records and business context; an outlier is not automatically an error." });
    const semantic = /revenue|sales|profit|cost|amount|income|expense|units|quantity|orders|clicks|conversion/i.test(c.name);
    if (semantic) findings.push({ type: "verified_fact", priority: "info", title: `${c.name}: distribution summary`, evidence: `Valid values: ${values.length.toLocaleString()}; total ${fmt(values.reduce((a,b)=>a+b,0))}; mean ${fmt(values.reduce((a,b)=>a+b,0)/values.length)}; median ${fmt(quantile(sorted,.5))}; range ${fmt(sorted[0])}–${fmt(sorted[sorted.length-1])}.`, recommendation: "Compare the mean and median to understand whether a small number of large values may influence the average." });
  }
  for (const c of categoryColumns) {
    const counts = new Map<string, number>();
    for (const row of rows) { const val = String(row[c.name] ?? "").trim(); if (val) counts.set(val, (counts.get(val)||0)+1); }
    const top = [...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
    if (top) findings.push({ type: "verified_fact", priority: "info", title: `Most frequent ${c.name}`, evidence: `“${top[0]}” occurs ${top[1].toLocaleString()} times (${Math.round(top[1]/Math.max(rows.length,1)*1000)/10}% of all rows).`, recommendation: "Use this as a record-count comparison, not a measure of revenue or performance." });
  }
  // Correlations are calculated on paired non-missing observations and explicitly reported as association only.
  const correlations: any[] = [];
  const pairCols = numericColumns.slice(0,6);
  for (let i=0;i<pairCols.length;i++) for (let j=i+1;j<pairCols.length;j++) {
    const pairs = rows.map(r=>[numberOf(r[pairCols[i].name]),numberOf(r[pairCols[j].name])] as const).filter(p=>p[0]!==null&&p[1]!==null) as [number,number][];
    if (pairs.length < 8) continue;
    const mx=pairs.reduce((s,p)=>s+p[0],0)/pairs.length, my=pairs.reduce((s,p)=>s+p[1],0)/pairs.length;
    const cov=pairs.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0), vx=pairs.reduce((s,p)=>s+(p[0]-mx)**2,0), vy=pairs.reduce((s,p)=>s+(p[1]-my)**2,0);
    const r=vx&&vy?cov/Math.sqrt(vx*vy):0;
    if (Number.isFinite(r)) correlations.push({ x:pairCols[i].name, y:pairCols[j].name, r:Math.round(r*1000)/1000, n:pairs.length, strength:Math.abs(r)>=.7?"strong":Math.abs(r)>=.4?"moderate":"weak" });
  }
  const strong = correlations.filter(c=>Math.abs(c.r)>=.4).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r)).slice(0,5);
  for (const c of strong) findings.push({ type: "statistical_observation", priority: Math.abs(c.r)>=.7?"medium":"low", title: `${c.strength[0].toUpperCase()+c.strength.slice(1)} association: ${c.x} and ${c.y}`, evidence: `Pearson correlation r = ${c.r} from ${c.n.toLocaleString()} paired rows.`, recommendation: "Association does not establish causation; investigate domain context and possible confounders." });
  const measureRows = rows.map(row => {
    const qualified: Row = { ...row };
    if (selectedSheet) for (const [column, value] of Object.entries(row)) qualified[`${selectedSheet}.${column}`] = value;
    return qualified;
  });
  const savedMeasures = calculatedMeasures.filter(measure => measure.active).map(measure => ({ id: measure.id, name: measure.name, formula: measure.formula, format: measure.format || "number", value: evaluateMeasure(measureRows, measure) }));
  const coverage = { rowsRead: rows.length, columnsDetected: headers.length, columnsProfiled: columns.length, numericFields: numericColumns.length, categoricalFields: categoryColumns.length, dateFields: columns.filter(c=>c.type==="date").length, columnsWithMissing: columns.filter(c=>c.missing>0).length, missingCells: columns.reduce((s,c)=>s+c.missing,0), duplicateRowsFlagged: duplicates, sheetsDetected: parsed.sheets.length, selectedSheet: parsed.selectedSheetName, sheetsAnalyzed: [parsed.selectedSheetName, ...(related?.joinedSheets || [])], sheetsNotAnalyzed: parsed.sheets.filter(s=>s.name!==parsed.selectedSheetName && !(related?.joinedSheets || []).includes(s.name)).map(s=>s.name), columnsNotAnalyzed: columns.filter(c=>c.type==="text"||c.type==="empty").map(c=>({name:c.name,reason:c.type==="empty"?"No populated values":"High-cardinality/text field; available in the data explorer but not automatically charted"})) };
  return { generatedAt: new Date().toISOString(), appliedFilters: activeFilters, savedMeasures: savedMeasures, source: { rowCount: rows.length, headers, sheets: parsed.sheets, selectedSheet: parsed.selectedSheetName, joinedSheets: related?.joinedSheets || [], warnings: parsed.warnings }, coverage, columns, qualityIssues, findings: findings.slice(0,18), correlations, methodology: ["Numeric summaries use valid parsed numeric values; missing/unparseable values are excluded from numeric calculations and counted in coverage.", "Potential outliers use the 1.5×IQR rule and require human review.", "Correlations use paired non-missing numeric observations and describe association, not causation.", "No external AI model was called; findings are deterministic and calculated from the uploaded source file."] };
}
