import { ColumnProfile, InferredType, SanitizedData, SemanticRole, SchemaContext } from "./types";
import { parseNumeric } from "./sanitizer";
import { buildDateTopology } from "./dateTopology";

const aliases: Record<SemanticRole, RegExp> = {
  revenue: /(^|[_\s-])(revenue|rev|sales|turnover|invoice[_\s-]?amount|gross[_\s-]?sales|net[_\s-]?sales|amount)([_\s-]|$)/i,
  cost: /(^|[_\s-])(cost|cogs|expense|expenses|spend|expenditure|purchase[_\s-]?cost)([_\s-]|$)/i,
  profit: /(^|[_\s-])(profit|margin[_\s-]?value|net[_\s-]?income|earnings)([_\s-]|$)/i,
  budget: /(^|[_\s-])(budget|target|quota|forecast[_\s-]?target)([_\s-]|$)/i,
  quantity: /(^|[_\s-])(qty|quantity|units|items|volume|count)([_\s-]|$)/i,
  rating: /(^|[_\s-])(rating|score|priority|severity|stars|satisfaction|rank)([_\s-]|$)/i,
  percentage: /(^|[_\s-])(percent|percentage|pct|rate|ratio|margin[_\s-]?pct|conversion[_\s-]?rate|ctr|cvr|roas|roi|cpc|cpa|click[_\s-]?through[_\s-]?rate|cost[_\s-]?per[_\s-]?conversion)([_\s-]|$)/i,
  date: /(^|[_\s-])(date|time|timestamp|created_at|updated_at|month|quarter|year|period|day)([_\s-]|$)/i,
  geography: /(^|[_\s-])(country|country_code|state|province|region|city|postcode|postal_code|zip|latitude|longitude|lat|lon|lng)([_\s-]|$)/i,
  identifier: /(^|[_\s-])(id|key|uuid|guid|code|number|no|sku|order_id|customer_id|invoice_id|transaction_id)([_\s-]|$)/i,
  category: /$a/, measure: /$a/, unknown: /$a/
};
const localizedAliases: Partial<Record<SemanticRole, RegExp>> = {
  revenue: /(राजस्व|बिक्री|आय|આવક|વેચાણ|કુલ વેચાણ)/i,
  cost: /(लागत|खर्च|व्यय|ખર્ચ|કિંમત|લાગત)/i,
  profit: /(लाभ|मुनाफा|नफा|નફો|નફાકારકતા)/i,
  budget: /(बजट|लक्ष्य|बજેટ|લક્ષ્ય)/i,
  quantity: /(मात्रा|संख्या|जથ્થો|માત્રા|એકમો)/i,
  rating: /(रेटिंग|अंक|प्राथमिकता|રેટિંગ|પ્રાથમિકતા)/i,
  percentage: /(प्रतिशत|प्रतिश|ટકા|પ્રતિશત|દર)/i,
  date: /(तारीख|दिनांक|महीना|वर्ष|તારીખ|મહિનો|વર્ષ)/i,
  geography: /(देश|राज्य|शहर|क्षेत्र|દેશ|રાજ્ય|શહેર|વિસ્તાર)/i,
  identifier: /(पहचान|क्रमांक|आईडी|ઓળખ|ક્રમांक|આઈડી)/i
};
function roleFromName(name: string): SemanticRole {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const raw = name.toLowerCase();
  const priority: SemanticRole[] = ["identifier", "date", "geography", "revenue", "cost", "profit", "budget", "percentage", "rating", "quantity"];
  return priority.find(role => aliases[role].test(n) || localizedAliases[role]?.test(raw)) || "unknown";
}
function parseDate(value: any): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && value > 20000 && value < 80000) return Date.UTC(1899, 11, 30) + value * 86400000;
  const s = String(value).trim();
  if (!s) return null;
  // ISO and year-first dates are unambiguous.
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[T\s].*)?$/.test(s)) {
    const t = Date.parse(s); return Number.isNaN(t) ? null : t;
  }
  // Common spreadsheet dates such as 8/13/2013, 13/8/2013, and 13-08-2013.
  const parts = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (parts) {
    const a = Number(parts[1]), b = Number(parts[2]);
    let year = Number(parts[3]); if (year < 100) year += year >= 70 ? 1900 : 2000;
    const month = a > 12 ? b : b > 12 ? a : a; // Ambiguous dates default to spreadsheet/US month-first convention.
    const day = a > 12 ? a : b > 12 ? b : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) return d.getTime();
    }
  }
  // Month-name dates are common in CSV exports.
  if (!/[A-Za-z]/.test(s)) return null;
  const t = Date.parse(s); return Number.isNaN(t) ? null : t;
}
function inferColumn(name: string, values: any[]): ColumnProfile {
  const nonNull = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
  const missing = values.length - nonNull.length;
  const uniqueValues = new Set(nonNull.map(v => v instanceof Date ? v.toISOString() : String(v).trim())).size;
  const cardinality = nonNull.length ? uniqueValues / nonNull.length : 0;
  const numericValues = nonNull.map(parseNumeric);
  const numericCount = numericValues.filter((v): v is number => v !== null).length;
  const numericParseRate = nonNull.length ? numericCount / nonNull.length : 0;
  const dateValues = nonNull.map(parseDate);
  const dateCount = dateValues.filter(v => v !== null).length;
  const dateParseRate = nonNull.length ? dateCount / nonNull.length : 0;
  const boolRate = nonNull.length ? nonNull.filter(v => ["true", "false", "yes", "no", "y", "n", "0", "1"].includes(String(v).toLowerCase())).length / nonNull.length : 0;
  const nums = numericValues.filter((v): v is number => v !== null);
  const integerLike = nums.length > 0 && nums.every(n => Number.isInteger(n));
  const min = nums.length ? Math.min(...nums.slice(0, 100000)) : undefined;
  const max = nums.length ? Math.max(...nums.slice(0, 100000)) : undefined;
  const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
  const sequentialUnique = integerLike && uniqueValues === nonNull.length && nums.length > 4 && min !== undefined && max !== undefined && max - min <= nums.length * 1.2 && max - min >= nums.length - 1;
  const nameRole = roleFromName(name);
  let inferredType: InferredType = "text", confidence = 0.65;
  if (!nonNull.length) { inferredType = "empty"; confidence = 1; }
  else if (boolRate === 1 && nameRole !== "identifier" && (new Set(nonNull.map(v => String(v).toLowerCase())).size > 1 || /(^|[_\s-])(is|has|flag|active|enabled|valid|deleted|approved)([_\s-]|$)/i.test(name))) { inferredType = "boolean"; confidence = 0.98; }
  else if (dateParseRate >= 0.85 && (nameRole === "date" || dateParseRate >= 0.95)) { inferredType = "date"; confidence = dateParseRate; }
  else if (numericParseRate >= 0.75) {
    if (nameRole === "identifier" || sequentialUnique) { inferredType = "identifier"; confidence = sequentialUnique ? 0.92 : 0.84; }
    else if (nameRole === "geography") { inferredType = "geo"; confidence = 0.8; }
    else if (nameRole === "percentage" || nonNull.some(v => typeof v === "string" && String(v).trim().endsWith("%"))) { inferredType = "percentage"; confidence = Math.max(0.85, numericParseRate); }
    else if (nameRole === "revenue" || nameRole === "cost" || nameRole === "profit" || nameRole === "budget" || nonNull.some(v => typeof v === "string" && /[$€£₹]/.test(v))) { inferredType = "currency"; confidence = Math.max(0.82, numericParseRate); }
    else if (integerLike) { inferredType = "integer"; confidence = 0.9; }
    else { inferredType = "number"; confidence = numericParseRate; }
  } else if (nameRole === "geography" && nonNull.length && nonNull.every(v => typeof v === "string")) { inferredType = "geo"; confidence = 0.78; }
  else if (nameRole === "identifier") { inferredType = "identifier"; confidence = 0.8; }
  else if (nameRole === "date" && dateParseRate > 0.5) { inferredType = "date"; confidence = dateParseRate; }

  let semanticRole: SemanticRole = nameRole;
  const reasons: string[] = [];
  if (nameRole !== "unknown") reasons.push(`Header matched ${nameRole} alias dictionary.`);
  if (numericParseRate > 0 && numericParseRate < 1) reasons.push(`Numeric parse rate is ${(numericParseRate * 100).toFixed(1)}%; mixed values detected.`);
  if (sequentialUnique) reasons.push("Unique sequential integer pattern detected; excluded from baseline measures.");
  if (integerLike && min !== undefined && max !== undefined && max - min <= 10 && uniqueValues >= 2 && uniqueValues <= 10 && nonNull.length >= 3 && nameRole !== "identifier") {
    if (nameRole === "rating") reasons.push("Explicit rating/score field has a narrow ordinal range and is excluded from additive totals.");
    else reasons.push("Narrow repetitive integer range detected; kept numeric unless the header identifies a rating/score, because small counts (for example conversions) are valid measures.");
  }
  if (inferredType === "identifier") semanticRole = "identifier";
  else if (inferredType === "date") semanticRole = "date";
  else if (inferredType === "geo") semanticRole = "geography";
  else if (semanticRole === "unknown") semanticRole = inferredType === "text" ? "category" : inferredType === "percentage" ? "percentage" : inferredType === "number" || inferredType === "integer" || inferredType === "currency" ? "measure" : "unknown";
  let recommendedAggregation: ColumnProfile["recommendedAggregation"] = "sum";
  let additivity: ColumnProfile["additivity"] = "additive";
  if (["identifier", "date", "geo", "text", "boolean", "empty"].includes(inferredType) || semanticRole === "rating") { recommendedAggregation = "count"; additivity = "non_additive"; }
  else if (semanticRole === "percentage" || inferredType === "percentage" || /price|unit[_ ]?price|average|avg|rate|ratio/i.test(name)) { recommendedAggregation = "avg"; additivity = "non_additive"; }
  else if (semanticRole === "budget") { recommendedAggregation = "sum"; additivity = "unknown"; reasons.push("Budget granularity is unknown; summation requires validation against row grain."); }
  else if (/inventory|stock|balance|headcount|on_hand/i.test(name)) { recommendedAggregation = "avg"; additivity = "semi_additive"; }
  else if (semanticRole === "quantity" || semanticRole === "revenue" || semanticRole === "cost" || semanticRole === "profit") { recommendedAggregation = "sum"; additivity = "additive"; }
  return { name, normalizedName: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), inferredType, semanticRole, confidence: Math.round(confidence * 1000) / 1000, userOverride: false, nonEmpty: nonNull.length, missing, missingPercent: values.length ? Math.round(missing / values.length * 10000) / 100 : 0, unique: uniqueValues, cardinality: Math.round(cardinality * 1000) / 1000, sample: nonNull.slice(0, 5), min, max, mean, integerLike, sequentialUnique, numericParseRate, dateParseRate, recommendedAggregation, additivity, reasons };
}
export function profileSanitized(data: SanitizedData): SchemaContext {
  const columns: Record<string, ColumnProfile> = {};
  for (const header of data.headers) columns[header] = inferColumn(header, data.rows.map(row => row[header]));
  const dateTopology = buildDateTopology(data.rows, Object.values(columns));
  return { version: "1.0.0", rowCount: data.rows.length, columnCount: data.headers.length, columns, dateTopology, warnings: data.warnings, sourceHeaders: data.headers };
}
