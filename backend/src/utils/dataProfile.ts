export type ColumnType = "text" | "number" | "date" | "boolean" | "empty";

function detectType(values: any[]): ColumnType {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== "");
  if (!nonEmpty.length) return "empty";
  const booleans = nonEmpty.every(v => typeof v === "boolean" || ["true","false"].includes(String(v).toLowerCase()));
  if (booleans) return "boolean";
  const numbers = nonEmpty.filter(v => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))).length;
  if (numbers / nonEmpty.length > 0.9) return "number";
  const dates = nonEmpty.filter(v => v instanceof Date || !Number.isNaN(Date.parse(String(v)))).length;
  if (dates / nonEmpty.length > 0.9) return "date";
  return "text";
}

export function profileRows(rows: Record<string, any>[]) {
  const names = rows.length ? Object.keys(rows[0]) : [];
  const profile = names.map(name => {
    const values = rows.map(r => r[name]);
    const type = detectType(values);
    const missing = values.filter(v => v === null || v === undefined || v === "").length;
    const unique = new Set(values.map(v => JSON.stringify(v))).size;
    return { name, type, missing, unique };
  });
  return { rows: rows.length, columns: names.length, profile };
}

export function recommendCharts(profile: {name:string,type:ColumnType}[]) {
  const dates = profile.filter(c => c.type === "date");
  const numbers = profile.filter(c => c.type === "number");
  const categories = profile.filter(c => c.type === "text");
  const out: {type:string,title:string,xField?:string,yField?:string}[] = [];
  if (dates[0] && numbers[0]) out.push({ type: "line", title: `${numbers[0].name} over time`, xField: dates[0].name, yField: numbers[0].name });
  if (categories[0] && numbers[0]) out.push({ type: "bar", title: `${numbers[0].name} by ${categories[0].name}`, xField: categories[0].name, yField: numbers[0].name });
  if (categories[0]) out.push({ type: "donut", title: `${categories[0].name} distribution`, xField: categories[0].name, yField: categories[0].name });
  if (numbers.length >= 2) out.push({ type: "scatter", title: `${numbers[0].name} vs ${numbers[1].name}`, xField: numbers[0].name, yField: numbers[1].name });
  return out;
}