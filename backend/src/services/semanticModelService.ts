import { parseSpreadsheet } from "./fileService";
import { applyPreparation, HistoryItem } from "./dataPreparationService";

export type CalculatedColumn = { id: string; name: string; formula: string; sheetName?: string; active: boolean; createdAt?: string };
export type CalculatedMeasure = { id: string; name: string; formula: string; format?: "number" | "percentage" | "currency"; active: boolean; createdAt?: string };
export type Relationship = { id: string; leftSheet: string; leftKey: string; rightSheet: string; rightKey: string; joinType: "left" | "inner"; cardinality?: "many-to-one" | "one-to-many" | "one-to-one" | "many-to-many"; active: boolean; createdAt?: string };

function numeric(value: any): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const original = String(value).trim();
  const negativeByParens = /^\(.*\)$/.test(original);
  const raw = original.replace(/^\((.*)\)$/, "$1").replace(/[,$€£₹¥%\s]/g, "");
  if (!raw || !/[0-9]/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return negativeByParens ? -Math.abs(n) : n;
}

type Token = { type: "number" | "field" | "identifier" | "operator" | "eof"; value: string };
function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    if (/\s/.test(formula[i])) { i++; continue; }
    const rest = formula.slice(i);
    const field = rest.match(/^\[([^\]]+)\]/);
    if (field) { tokens.push({ type: "field", value: field[1].trim() }); i += field[0].length; continue; }
    const num = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (num) { tokens.push({ type: "number", value: num[0] }); i += num[0].length; continue; }
    const id = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) { tokens.push({ type: "identifier", value: id[0].toUpperCase() }); i += id[0].length; continue; }
    if ("+-*/()".includes(formula[i])) { tokens.push({ type: "operator", value: formula[i] }); i++; continue; }
    throw new Error(`Unsupported formula character: ${formula[i]}`);
  }
  tokens.push({ type: "eof", value: "" });
  if (tokens.length > 300) throw new Error("Formula is too complex (maximum 300 tokens).");
  return tokens;
}

/** Small arithmetic parser; never executes JavaScript or evaluates arbitrary code. */
export function evaluateFormula(formula: string, row: Record<string, any> = {}, rows: Record<string, any>[] = [], allowAggregates = false): number | null {
  if (!String(formula || "").trim()) throw new Error("Formula is required.");
  const tokens = tokenize(formula); let pos = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const fieldValue = (name: string) => numeric(row[name]);
  function primary(): number | null {
    const t = take();
    if (t.type === "number") return Number(t.value);
    if (t.type === "field") return fieldValue(t.value);
    if (t.value === "(") { const v = expression(); if (take().value !== ")") throw new Error("Missing closing parenthesis."); return v; }
    if (t.type === "identifier") {
      if (!allowAggregates || !["SUM", "AVG", "AVERAGE", "COUNT", "MIN", "MAX"].includes(t.value)) throw new Error(`Function ${t.value} is not allowed here.`);
      if (take().value !== "(") throw new Error(`Expected ( after ${t.value}.`);
      const arg = take();
      if (arg.type !== "field") throw new Error(`${t.value} requires a column reference such as ${"[Revenue]"}.`);
      if (take().value !== ")") throw new Error("Aggregate functions accept one column reference.");
      const vals = rows.map(r => numeric(r[arg.value])).filter((v): v is number => v !== null);
      if (t.value === "COUNT") return rows.filter(r => r[arg.value] !== null && r[arg.value] !== undefined && r[arg.value] !== "").length;
      if (!vals.length) return null;
      if (t.value === "SUM") return vals.reduce((a, b) => a + b, 0);
      if (t.value === "AVG" || t.value === "AVERAGE") return vals.reduce((a, b) => a + b, 0) / vals.length;
      if (t.value === "MIN") return Math.min(...vals);
      return Math.max(...vals);
    }
    if (t.value === "-") { const v = primary(); return v === null ? null : -v; }
    if (t.value === "+") return primary();
    throw new Error("Expected a number, column reference, or parenthesized expression.");
  }
  function term(): number | null {
    let left = primary();
    while (peek().value === "*" || peek().value === "/") {
      const op = take().value; const right = primary();
      if (left === null || right === null) { left = null; continue; }
      if (op === "/" && right === 0) { left = null; continue; }
      left = op === "*" ? left * right : left / right;
      if (!Number.isFinite(left)) left = null;
    }
    return left;
  }
  function expression(): number | null {
    let left = term();
    while (peek().value === "+" || peek().value === "-") {
      const op = take().value; const right = term();
      if (left === null || right === null) { left = null; continue; }
      left = op === "+" ? left + right : left - right;
      if (!Number.isFinite(left)) left = null;
    }
    return left;
  }
  const result = expression();
  if (peek().type !== "eof") throw new Error(`Unexpected token: ${peek().value}`);
  return result !== null && Number.isFinite(result) ? result : null;
}

export function formulaFields(formula: string): string[] {
  return Array.from(String(formula || "").matchAll(/\[([^\]]+)\]/g)).map(match => String(match[1]).trim()).filter(Boolean);
}

/** Apply active calculated columns in dependency order; reject unknown or cyclic local dependencies. */
export function applyCalculatedColumns(rows: Record<string, any>[], definitions: CalculatedColumn[] = [], sheetName?: string) {
  const active = definitions.filter(d => d.active && (!d.sheetName || d.sheetName === sheetName));
  const pending = [...active];
  const completed = new Set<string>();
  const sourceColumns = new Set(Object.keys(rows[0] || {}));
  const available = new Set(sourceColumns);
  while (pending.length) {
    const index = pending.findIndex(def => {
      const fields = formulaFields(def.formula);
      return fields.every(field => available.has(field) || field.includes(".") && sourceColumns.has(field));
    });
    if (index < 0) {
      const unresolved = pending[0];
      const unresolvedFields = formulaFields(unresolved.formula).filter(field => !available.has(field) && !sourceColumns.has(field));
      throw new Error(unresolvedFields.length ? `Calculated column "${unresolved.name}" references unavailable field(s): ${unresolvedFields.join(", ")}.` : `Calculated column dependency cycle detected near "${unresolved.name}".`);
    }
    const [def] = pending.splice(index, 1);
    if (!/^[A-Za-z_][A-Za-z0-9_ ]{0,79}$/.test(def.name.trim())) throw new Error("Calculated column names must start with a letter or underscore and contain only letters, numbers, spaces, or underscores.");
    if (!def.formula || def.formula.length > 500) throw new Error("Formula is required and must be 500 characters or fewer.");
    if (sourceColumns.has(def.name) || completed.has(def.name)) throw new Error(`Column name already exists: ${def.name}`);
    for (const row of rows) row[def.name] = evaluateFormula(def.formula, row, [], false);
    available.add(def.name); completed.add(def.name);
  }
  return rows;
}

export function validateMeasureDependencies(rows: Record<string, any>[], measure: CalculatedMeasure) {
  if (!measure.active) throw new Error("This measure is inactive.");
  if (!rows.length) return;
  const available = new Set(rows.flatMap(row => Object.keys(row)));
  const missing = formulaFields(measure.formula).filter(field => !available.has(field));
  if (missing.length) throw new Error(`Measure "${measure.name}" references unavailable field(s) in the current semantic model: ${missing.join(", ")}. Check the selected worksheet and active relationships.`);
}

export function evaluateMeasure(rows: Record<string, any>[], measure: CalculatedMeasure) {
  validateMeasureDependencies(rows, measure);
  return evaluateFormula(measure.formula, {}, rows, true);
}

/** Validate declared cardinality against actual non-empty key uniqueness. */
export function validateRelationshipCardinality(leftRows: Record<string, any>[], rightRows: Record<string, any>[], rel: Relationship) {
  const unique = (rows: Record<string, any>[], key: string, sheet: string) => {
    const seen = new Set<string>();
    for (const row of rows) { const value = row[`${sheet}.${key}`] !== undefined ? row[`${sheet}.${key}`] : row[key]; if (value === null || value === undefined || String(value).trim() === "") continue; const token = String(value); if (seen.has(token)) return false; seen.add(token); }
    return true;
  };
  const leftUnique = unique(leftRows, rel.leftKey, rel.leftSheet), rightUnique = unique(rightRows, rel.rightKey, rel.rightSheet);
  const cardinality = rel.cardinality || "many-to-one";
  if ((cardinality === "many-to-one" || cardinality === "one-to-one") && !rightUnique) throw new Error(`Relationship ${rel.leftSheet}.${rel.leftKey} → ${rel.rightSheet}.${rel.rightKey} declares ${cardinality}, but the right key is not unique.`);
  if ((cardinality === "one-to-many" || cardinality === "one-to-one") && !leftUnique) throw new Error(`Relationship ${rel.leftSheet}.${rel.leftKey} → ${rel.rightSheet}.${rel.rightKey} declares ${cardinality}, but the left key is not unique.`);
  return { cardinality, leftKeyUnique: leftUnique, rightKeyUnique: rightUnique };
}

/** Return unique source-row references even when joins duplicate records. */
export function collectSourceRows(rows: Record<string, any>[]) {
  const unique = new Map<string, { worksheet: string; rowNumber: number }>();
  for (const row of rows) for (const ref of Array.isArray(row.__sourceRows) ? row.__sourceRows : []) {
    if (!ref || typeof ref.worksheet !== "string" || !Number.isFinite(Number(ref.rowNumber))) continue;
    unique.set(`${ref.worksheet}\u0000${Number(ref.rowNumber)}`, { worksheet: ref.worksheet, rowNumber: Number(ref.rowNumber) });
  }
  return Array.from(unique.values());
}

/** Resolve a safe, explicit relationship graph. Ambiguous cycles/parallel edges fail loudly instead of silently changing totals. */
export function loadRelatedRows(filePath: string, selectedSheet: string, history: HistoryItem[] = [], relationships: Relationship[] = [], calculatedColumns: CalculatedColumn[] = []) {
  const baseParsed = parseSpreadsheet(filePath, selectedSheet);
  let rows = applyPreparation(baseParsed.rows.map((row, index) => ({ ...row, __sourceRows: [{ worksheet: selectedSheet, rowNumber: index + 2 }] })), history, baseParsed.selectedSheetName).rows;
  applyCalculatedColumns(rows, calculatedColumns, selectedSheet);
  for (const row of rows) for (const [column, value] of Object.entries({ ...row })) if (column !== "__sourceRows") row[`${selectedSheet}.${column}`] = value;
  const active = relationships.filter(r => r.active);
  const edgeKey = (r: Relationship) => [r.leftSheet, r.leftKey, r.rightSheet, r.rightKey].join("\u0000");
  const seenEdges = new Set<string>();
  const pairEdges = new Set<string>();
  for (const rel of active) {
    const pair = [rel.leftSheet, rel.rightSheet].sort().join("\u0000");
    if (pairEdges.has(pair)) throw new Error(`Ambiguous model: multiple active relationships connect ${rel.leftSheet} and ${rel.rightSheet}. Keep one active relationship per worksheet pair.`);
    pairEdges.add(pair);
  }
  const used = new Set<string>([selectedSheet]);
  const joinedSheets: string[] = [];
  const queue = [selectedSheet];
  while (queue.length) {
    const currentSheet = queue.shift()!;
    const edges = active.filter(r => r.leftSheet === currentSheet || r.rightSheet === currentSheet);
    for (const rel of edges) {
      const edgeId = edgeKey(rel);
      if (seenEdges.has(edgeId)) continue;
      const targetSheet = rel.leftSheet === currentSheet ? rel.rightSheet : rel.leftSheet;
      if (used.has(targetSheet)) throw new Error(`Ambiguous relationship cycle detected between ${currentSheet} and ${targetSheet}. Remove the redundant relationship or model it as a supported single path.`);
      const currentKey = rel.leftSheet === currentSheet ? rel.leftKey : rel.rightKey;
      const targetKey = rel.leftSheet === currentSheet ? rel.rightKey : rel.leftKey;
      const currentKeyName = `${currentSheet}.${currentKey}`;
      const targetKeyName = `${targetSheet}.${targetKey}`;
      if (!Object.keys(rows[0] || {}).some(k => k === currentKeyName || k === currentKey)) throw new Error(`Relationship key is unavailable in the joined model: ${currentKeyName}.`);
      const targetParsed = parseSpreadsheet(filePath, targetSheet);
      let targetRows = applyPreparation(targetParsed.rows.map((row, index) => ({ ...row, __sourceRows: [{ worksheet: targetSheet, rowNumber: index + 2 }] })), history, targetSheet).rows;
      applyCalculatedColumns(targetRows, calculatedColumns, targetSheet);
      if (!Object.prototype.hasOwnProperty.call(targetRows[0] || {}, targetKey)) throw new Error(`Relationship key is unavailable in worksheet ${targetSheet}: ${targetKey}.`);
      const index = new Map<string, Record<string, any>[]>();
      for (const target of targetRows) {
        const raw = target[targetKey];
        const key = raw === null || raw === undefined ? "" : String(raw).trim();
        if (!key) continue;
        const bucket = index.get(key) || []; bucket.push(target); index.set(key, bucket);
      }
      const joined: Record<string, any>[] = [];
      for (const source of rows) {
        const raw = source[currentKeyName] !== undefined ? source[currentKeyName] : source[currentKey];
        const key = raw === null || raw === undefined ? "" : String(raw).trim();
        const matches = key ? index.get(key) || [] : [];
        if (!matches.length && rel.joinType === "inner") continue;
        for (const match of (matches.length ? matches : [{}])) {
          const out: Record<string, any> = { ...source };
          if (match.__sourceRows) out.__sourceRows = [...(Array.isArray(source.__sourceRows) ? source.__sourceRows : []), ...(match.__sourceRows as any[])];
          const targetColumns = Object.keys(targetRows[0] || {}).filter(column => column !== "__sourceRows");
          for (const column of targetColumns) {
            const value = Object.prototype.hasOwnProperty.call(match, column) ? match[column] : null;
            out[`${targetSheet}.${column}`] = value;
          }
          joined.push(out);
        }
      }
      rows = joined;
      used.add(targetSheet); joinedSheets.push(targetSheet); queue.push(targetSheet); seenEdges.add(edgeId);
    }
  }
  return { rows, selectedSheet: baseParsed.selectedSheetName, joinedSheets, sourceRowReferences: collectSourceRows(rows) };
}
