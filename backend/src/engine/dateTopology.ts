import { ColumnProfile, DateTopology } from "./types";
function toDate(value: any): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  if (typeof value !== "string") return null;
  const s = value.trim(); if (!s) return null;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) { const date = new Date(s); return Number.isNaN(date.getTime()) ? null : date; }
  const parts = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (parts) {
    const a = Number(parts[1]), b = Number(parts[2]); let year = Number(parts[3]); if (year < 100) year += year >= 70 ? 1900 : 2000;
    const month = a > 12 ? b : b > 12 ? a : a; const day = a > 12 ? a : b > 12 ? b : b;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date;
    return null;
  }
  if (!/[A-Za-z]/.test(s)) return null;
  const date = new Date(s); return Number.isNaN(date.getTime()) ? null : date;
}
function dayKey(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`; }
function isWeekday(key: string) { const day = new Date(`${key}T00:00:00Z`).getUTCDay(); return day !== 0 && day !== 6; }
function expectedPeriods(keys: string[], frequency: DateTopology["frequency"]): number {
  if (!keys.length) return 0;
  const start = new Date(`${keys[0]}T00:00:00Z`), end = new Date(`${keys[keys.length - 1]}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  if (frequency === "daily") return days;
  if (frequency === "business_daily") {
    let count = 0; const d = new Date(start);
    for (let i = 0; i < days; i++, d.setUTCDate(d.getUTCDate() + 1)) if (![0, 6].includes(d.getUTCDay())) count++;
    return Math.max(keys.length, count);
  }
  if (frequency === "weekly") return Math.max(keys.length, Math.floor((days - 1) / 7) + 1);
  const monthSpan = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  if (frequency === "monthly") return monthSpan + 1;
  if (frequency === "quarterly") return Math.floor(monthSpan / 3) + 1;
  if (frequency === "yearly") return end.getUTCFullYear() - start.getUTCFullYear() + 1;
  return keys.length;
}
export function buildDateTopology(rows: Record<string, any>[], profiles: ColumnProfile[]): DateTopology[] {
  return profiles.filter(p => p.inferredType === "date").map(profile => {
    const dates = rows.map(r => toDate(r[profile.name])).filter((d): d is Date => !!d).sort((a,b)=>a.getTime()-b.getTime());
    const keys = Array.from(new Set(dates.map(dayKey)));
    const gaps: string[] = [];
    const diffs = keys.slice(1).map((k, i) => Math.round((Date.parse(`${k}T00:00:00Z`) - Date.parse(`${keys[i]}T00:00:00Z`)) / 86400000));
    const sortedDiffs = [...diffs].sort((a,b)=>a-b);
    const median = sortedDiffs.length ? sortedDiffs[Math.floor(sortedDiffs.length/2)] : 1;
    const threeDayGaps = diffs.filter(d => d === 3).length;
    let frequency: DateTopology["frequency"] = "irregular";
    if (diffs.length && median <= 1 && threeDayGaps / diffs.length >= 0.15) frequency = "business_daily";
    else if (median <= 1) frequency = "daily";
    else if (median <= 3 && threeDayGaps / Math.max(1, diffs.length) >= 0.4) frequency = "business_daily";
    else if (median >= 6 && median <= 8) frequency = "weekly";
    else if (median >= 27 && median <= 32) frequency = "monthly";
    else if (median >= 88 && median <= 95) frequency = "quarterly";
    else if (median >= 350 && median <= 380) frequency = "yearly";
    const daySet = new Set(keys);
    if (keys.length > 1 && (frequency === "daily" || frequency === "business_daily")) {
      const start = new Date(`${keys[0]}T00:00:00Z`), end = new Date(`${keys[keys.length-1]}T00:00:00Z`);
      const span = Math.round((end.getTime()-start.getTime())/86400000)+1;
      for (let i=1, d=new Date(start); i<span-1 && gaps.length<100; i++) {
        d.setUTCDate(d.getUTCDate()+1);
        const key = dayKey(d);
        if (!daySet.has(key) && (frequency !== "business_daily" || isWeekday(key))) gaps.push(key);
      }
    }
    const expected = expectedPeriods(keys, frequency);
    const observedWeekdays = keys.filter(isWeekday).length;
    const expectedWeekdays = keys.length ? (() => {
      const start = new Date(`${keys[0]}T00:00:00Z`), end = new Date(`${keys[keys.length-1]}T00:00:00Z`);
      const span = Math.round((end.getTime()-start.getTime())/86400000)+1; let count = 0; const d = new Date(start);
      for (let i=0;i<span;i++,d.setUTCDate(d.getUTCDate()+1)) if (isWeekday(dayKey(d))) count++;
      return count;
    })() : 0;
    const businessGaps = gaps.filter(isWeekday);
    const hasWeekendGaps = keys.length > 1 && (() => {
      const start = new Date(`${keys[0]}T00:00:00Z`), end = new Date(`${keys[keys.length-1]}T00:00:00Z`);
      const span = Math.round((end.getTime()-start.getTime())/86400000)+1; const d = new Date(start);
      for (let i=0;i<span;i++,d.setUTCDate(d.getUTCDate()+1)) if ([0,6].includes(d.getUTCDay()) && !daySet.has(dayKey(d))) return true;
      return false;
    })();
    return { column: profile.name, frequency, calendarContinuity: expected ? Math.min(1, keys.length/expected) : 1, businessDayContinuity: expectedWeekdays ? Math.min(1, observedWeekdays/expectedWeekdays) : 1, observedPeriods: keys.length, expectedPeriods: expected, gaps, hasWeekendGaps, hasBusinessDayGaps: businessGaps.length > 0, confidence: Math.min(0.98, 0.5 + Math.min(keys.length, 20)/40 + (diffs.length ? 0.1 : 0)) };
  });
}
