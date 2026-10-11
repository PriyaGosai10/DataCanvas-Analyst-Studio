import XLSX from "xlsx";

export type ParsedSheetInfo = { name: string; rows: number; columns: number; hidden: boolean };

function rowsForSheet(workbook: XLSX.WorkBook, name: string) {
  const sheet = workbook.Sheets[name];
  if (!sheet || !sheet["!ref"]) return [] as Record<string, any>[];
  const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false });
  if (!matrix.length) return [] as Record<string, any>[];
  // Look through the first 15 non-empty rows for the most plausible header row.
  // This handles common exports with a report title or metadata above the table.
  const candidateLimit = Math.min(15, matrix.length - 1);
  let headerIndex = 0, bestScore = -1;
  for (let i = 0; i <= candidateLimit; i++) {
    const row = matrix[i] || [];
    const cells = row.map((v: any) => String(v ?? "").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const unique = new Set(cells.map((v: string) => v.toLowerCase())).size;
    const next = matrix[i + 1] || [];
    const nextCount = next.filter((v: any) => v !== "" && v !== null && v !== undefined).length;
    const score = cells.length * 4 + unique * 2 + Math.min(nextCount, cells.length) + (i === 0 ? 0.25 : 0);
    if (score > bestScore) { bestScore = score; headerIndex = i; }
  }
  const rawHeaders = (matrix[headerIndex] || []).map((v: any, i: number) => String(v ?? "").trim() || `Column_${i + 1}`);
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((header: string) => {
    const n = (seen.get(header.toLowerCase()) || 0) + 1; seen.set(header.toLowerCase(), n);
    return n === 1 ? header : `${header} (${n})`;
  });
  const rows: Record<string, any>[] = [];
  for (const values of matrix.slice(headerIndex + 1)) {
    if (!values.some((v: any) => v !== "" && v !== null && v !== undefined)) continue;
    const row: Record<string, any> = {};
    headers.forEach((header: string, i: number) => { row[header] = values[i] === undefined ? "" : values[i]; });
    rows.push(row);
  }
  return rows;
}
function scoreRows(rows: Record<string, any>[]) {
  if (!rows.length) return 0;
  const headers = Object.keys(rows[0] || {}).filter(k => k.trim() && !/^__EMPTY/i.test(k));
  const nonEmpty = rows.filter(row => Object.values(row).some(v => v !== "" && v !== null && v !== undefined)).length;
  const width = headers.length;
  // Prefer an actual rectangular data table over a blank/title-only worksheet.
  return nonEmpty * Math.max(width, 1) + (nonEmpty >= 2 && width >= 2 ? 1000 : 0);
}

export function parseSpreadsheet(filePath: string, preferredSheetName?: string) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, cellNF: true, cellStyles: true, dense: false });
  const sheetInfos: ParsedSheetInfo[] = workbook.SheetNames.map(name => {
    const rows = rowsForSheet(workbook, name);
    const sheetMeta = workbook.Workbook?.Sheets?.find(s => s.name === name);
    return { name, rows: rows.length, columns: Object.keys(rows[0] || {}).length, hidden: Number(sheetMeta?.Hidden || 0) > 0 };
  });
  let selectedName = workbook.SheetNames[0];
  let selectedRows: Record<string, any>[] = [];
  let bestScore = -1;
  const preferredExists = !!preferredSheetName && workbook.SheetNames.includes(preferredSheetName);
  for (const name of workbook.SheetNames) {
    const rows = rowsForSheet(workbook, name);
    const score = scoreRows(rows);
    if (preferredExists && name === preferredSheetName) {
      selectedName = name;
      selectedRows = rows;
      bestScore = score;
      break;
    }
    if (score > bestScore) { bestScore = score; selectedName = name; selectedRows = rows; }
  }
  return {
    rows: selectedRows,
    sheetNames: workbook.SheetNames,
    sheets: sheetInfos,
    selectedSheetName: selectedName || "",
    warnings: workbook.SheetNames.length > 1 ? [`Workbook contains ${workbook.SheetNames.length} worksheets. “${selectedName}” is the active worksheet; other sheets remain available for explicit selection and are not merged automatically.`] : []
  };
}

export function rowsForDataset(filePath: string) {
  return parseSpreadsheet(filePath).rows;
}
