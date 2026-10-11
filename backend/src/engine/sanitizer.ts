import { SanitizedData, SanitizerWarning } from "./types";

const NULL_TOKENS = new Set(["", "na", "n/a", "n.a.", "null", "none", "unknown", "undefined", "\\n", "-999", "-9999"]);
const NUMERIC_CLEAN = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?%?$/;

function normalizeHeader(value: unknown, index: number): string {
  const base = String(value ?? "").replace(/^\uFEFF/, "").trim() || `Column_${index + 1}`;
  return base.replace(/\s+/g, " ");
}
function isNullToken(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && NULL_TOKENS.has(value.trim().toLowerCase()));
}
export function parseNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || isNullToken(value)) return null;
  let s = value.trim().replace(/[\u00a0\u202f\u200b]/g, " ");
  if (!s) return null;
  // Accounting exports often represent negative amounts with parentheses or a trailing minus.
  const parenthesized = /^\(.*\)$/.test(s);
  const trailingMinus = /-$/.test(s);
  const leadingMinus = /^-/.test(s);
  s = s.replace(/^\((.*)\)$/, "$1").replace(/\s+/g, "");
  // Strip common currency symbols and ISO currency labels, while preserving signs and separators.
  s = s.replace(/(?:USD|EUR|GBP|INR|CAD|AUD|JPY|CNY|AED|CHF)/gi, "")
       .replace(/[₹$€£¥₩₽₺₫₪₦฿]/g, "");
  const percent = s.endsWith("%");
  if (percent) s = s.slice(0, -1);
  s = s.replace(/\s/g, "");
  if (!/^[+-]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const sign = (parenthesized || trailingMinus || leadingMinus) ? -1 : 1;
  s = s.replace(/^[+-]/, "").replace(/-$/, "");
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    // Whichever separator occurs last is the decimal separator; the other is grouping.
    if (comma > dot) s = s.replace(/\./g, "").replace(/,/g, ".");
    else s = s.replace(/,/g, "");
  } else if (comma >= 0) {
    const parts = s.split(",");
    if (parts.length > 2) {
      const last = parts[parts.length - 1];
      s = last.length === 3 ? parts.join("") : `${parts.slice(0, -1).join("")}.${last}`;
    } else {
      const decimalDigits = parts[1]?.length || 0;
      s = decimalDigits > 0 && decimalDigits !== 3 ? `${parts[0]}.${parts[1]}` : parts.join("");
    }
  } else if (dot >= 0) {
    const parts = s.split(".");
    if (parts.length > 2) {
      const last = parts[parts.length - 1];
      s = last.length === 3 ? parts.join("") : `${parts.slice(0, -1).join("")}.${last}`;
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0) {
      // 1.234 is usually a grouped integer in exports; decimal precision with 3 digits is ambiguous.
      s = parts.join("");
    }
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const signed = sign * Math.abs(n);
  return percent ? signed / 100 : signed;
}
function looksLikeRepeatedHeader(row: Record<string, any>, headers: string[]): boolean {
  const pairs = headers.filter(h => String(row[h] ?? "").trim().toLowerCase() === h.trim().toLowerCase()).length;
  return headers.length > 0 && pairs / headers.length >= 0.6;
}

/** Normalizes null sentinels, deduplicates headers, removes repeated header rows, and preserves raw values otherwise. */
export function sanitizeRows(inputRows: Record<string, any>[], originalHeaders?: string[]): SanitizedData {
  const warnings: SanitizerWarning[] = [];
  if (!Array.isArray(inputRows) || inputRows.length === 0) return { rows: [], headers: [], warnings: [{ code: "EMPTY_DATA", message: "The file has no data rows." }], rowCount: 0 };
  const rawHeaders = originalHeaders?.length ? originalHeaders : Object.keys(inputRows[0] || {});
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const normalized = normalizeHeader(h, i);
    const count = (seen.get(normalized.toLowerCase()) || 0) + 1;
    seen.set(normalized.toLowerCase(), count);
    if (count > 1) warnings.push({ code: "DUPLICATE_HEADER", column: normalized, message: `Duplicate header renamed to ${normalized} (${count}).` });
    return count === 1 ? normalized : `${normalized} (${count})`;
  });
  const sourceKeys = Object.keys(inputRows[0] || {});
  const rows: Record<string, any>[] = [];
  let nullCount = 0, repeatedHeaders = 0;
  for (const source of inputRows) {
    const row: Record<string, any> = {};
    sourceKeys.forEach((key, i) => {
      const target = headers[i] || `Column_${i + 1}`;
      const value = source[key];
      if (isNullToken(value)) { row[target] = null; if (value !== null && value !== undefined) nullCount++; }
      else row[target] = typeof value === "string" ? value.replace(/[\u200b\ufeff]/g, "").replace(/[\u00a0\u202f]/g, " ").trim() : value;
    });
    if (looksLikeRepeatedHeader(row, headers)) { repeatedHeaders++; continue; }
    rows.push(row);
  }
  if (nullCount) warnings.push({ code: "NULL_SENTINELS_NORMALIZED", message: "Non-standard null tokens were normalized to null.", count: nullCount });
  if (repeatedHeaders) warnings.push({ code: "REPEATED_HEADER_ROWS_REMOVED", message: "Repeated header rows were removed from the data body.", count: repeatedHeaders });
  // A common export error places a report title above the real header. Detect only when the first row is mostly empty and a later row looks like column names.
  const firstValues = Object.values(rows[0] || {});
  if (firstValues.length && firstValues.filter(v => v == null || v === "").length / firstValues.length > 0.7) {
    warnings.push({ code: "POSSIBLE_HEADER_MISALIGNMENT", message: "The first data row is mostly empty. Review the header row before trusting the profile." });
  }
  if (rows.length) {
    for (const header of headers) {
      const values = rows.map(row => row[header]).filter(v => v !== null && v !== undefined && String(v).trim() !== "");
      if (values.length >= 5) {
        const numeric = values.filter(v => parseNumeric(v) !== null).length;
        const rate = numeric / values.length;
        if (rate >= 0.5 && rate < 0.85) warnings.push({ code: "MIXED_NUMERIC_FORMAT", column: header, count: values.length - numeric, message: `Column “${header}” contains mixed numeric and non-numeric values; review ${values.length - numeric} value(s) before using it in totals.` });
      }
      const missing = rows.length - values.length;
      if (rows.length >= 5 && missing / rows.length >= 0.25) warnings.push({ code: "HIGH_MISSINGNESS", column: header, count: missing, message: `Column “${header}” has ${Math.round(missing / rows.length * 100)}% blank or null values.` });
    }
  }
  return { rows, headers, warnings, rowCount: rows.length };
}
