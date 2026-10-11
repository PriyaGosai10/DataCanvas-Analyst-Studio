import { parseNumeric } from "../engine/sanitizer";

export type PreparationOperation =
  | { type: "trim_text" }
  | { type: "normalize_category"; column: string; mode: "trim" | "lowercase" | "uppercase" }
  | { type: "replace_missing"; column: string; replacement: string | number | boolean }
  | { type: "convert_numeric"; column: string }
  | { type: "convert_date"; column: string }
  | { type: "drop_duplicate_rows" };

export type HistoryItem = { id: string; operation: PreparationOperation; active: boolean; createdAt: string; summary: string; sheetName?: string };

function isMissing(value: any): boolean {
  return value === null || value === undefined || (typeof value === "string" && ["", "na", "n/a", "null", "none", "undefined"].includes(value.trim().toLowerCase()));
}
function numeric(value: any): number | null { return parseNumeric(value); }

export function applyPreparation(rows: Record<string, any>[], history: HistoryItem[] = [], sheetName?: string) {
  let output = rows.map(row => ({ ...row }));
  const applied: Array<{ id: string; type: string; affected: number }> = [];
  for (const item of history.filter(x => x.active && (!sheetName || !x.sheetName || x.sheetName === sheetName))) {
    const op = item.operation;
    let affected = 0;
    if (op.type === "trim_text") {
      output = output.map(row => {
        const next = { ...row };
        for (const key of Object.keys(next)) if (typeof next[key] === "string") {
          const trimmed = next[key].trim();
          if (trimmed !== next[key]) { next[key] = trimmed; affected++; }
        }
        return next;
      });
    } else if (op.type === "normalize_category") {
      output = output.map(row => {
        if (!(op.column in row) || typeof row[op.column] !== "string") return row;
        const before = row[op.column], trimmed = before.trim().replace(/\s+/g, " ");
        const after = op.mode === "lowercase" ? trimmed.toLocaleLowerCase() : op.mode === "uppercase" ? trimmed.toLocaleUpperCase() : trimmed;
        if (after !== before) affected++;
        return { ...row, [op.column]: after };
      });
    } else if (op.type === "replace_missing") {
      output = output.map(row => {
        if (!(op.column in row) || !isMissing(row[op.column])) return row;
        affected++;
        return { ...row, [op.column]: op.replacement };
      });
    } else if (op.type === "convert_date") {
      output = output.map(row => {
        if (!(op.column in row) || isMissing(row[op.column]) || row[op.column] instanceof Date) return row;
        const timestamp = typeof row[op.column] === "string" ? Date.parse(row[op.column].trim()) : NaN;
        if (!Number.isFinite(timestamp)) { affected++; return { ...row, [op.column]: null }; }
        affected++;
        return { ...row, [op.column]: new Date(timestamp) };
      });
    } else if (op.type === "convert_numeric") {
      output = output.map(row => {
        if (!(op.column in row) || isMissing(row[op.column])) return row;
        const converted = numeric(row[op.column]);
        if (converted === null) {
          if (row[op.column] !== null) affected++;
          return { ...row, [op.column]: null };
        }
        if (converted !== row[op.column]) affected++;
        return { ...row, [op.column]: converted };
      });
    } else if (op.type === "drop_duplicate_rows") {
      const seen = new Set<string>();
      output = output.filter(row => {
        const key = JSON.stringify(Object.keys(row).filter(k => k !== "__sourceRows").sort().map(k => row[k] instanceof Date ? row[k].toISOString() : row[k] ?? null));
        if (seen.has(key)) { affected++; return false; }
        seen.add(key); return true;
      });
    }
    applied.push({ id: item.id, type: op.type, affected });
  }
  return { rows: output, applied, originalRowCount: rows.length, preparedRowCount: output.length };
}
export function previewPreparation(rows: Record<string, any>[], operation: PreparationOperation, history: HistoryItem[] = [], sheetName?: string) {
  const existing = applyPreparation(rows, history, sheetName);
  const preview = applyPreparation(rows, [...history, { id: "preview", operation, active: true, createdAt: new Date(0).toISOString(), summary: "Preview only", sheetName }], sheetName);
  const last = preview.applied[preview.applied.length - 1];
  return { operation, affected: last?.affected || 0, originalRowCount: rows.length, preparedRowCount: preview.preparedRowCount, currentPreparedRowCount: existing.preparedRowCount, sampleBefore: existing.rows.slice(0, 10), sampleAfter: preview.rows.slice(0, 10), warnings: (operation.type === "convert_numeric" || operation.type === "convert_date") && last?.affected ? [`${last.affected} values were changed or could not be parsed and may become null. Review the preview before applying.`] : [] };
}
