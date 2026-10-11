import { ColumnProfile, MetricRegistry, SanitizerWarning } from "./types";

/**
 * Flags common mixed-grain traps. It is deliberately conservative: it never
 * promotes a suspicious metric to additive; it downgrades confidence and blocks
 * unsafe auto-generation until the user confirms the grain.
 */
export function applyGranularityGuard(registry: MetricRegistry, columns: ColumnProfile[], rows: Record<string, any>[]): { registry: MetricRegistry; warnings: SanitizerWarning[] } {
  const warnings: SanitizerWarning[] = [];
  const byName = new Map(columns.map(c => [c.name, c]));
  const metrics = registry.metrics.map(metric => {
    if (metric.dependencies.length !== 1) return metric;
    const field = metric.dependencies[0];
    const profile = byName.get(field);
    if (!profile) return metric;
    const normalized = field.toLowerCase();
    const budgetLike = profile.semanticRole === "budget" || /(^|[_\s-])(budget|target|quota|forecast)([_\s-]|$)/i.test(normalized);
    const semiAdditive = /(^|[_\s-])(inventory|stock|balance|headcount|on_hand|snapshot)([_\s-]|$)/i.test(normalized);
    if (semiAdditive) return { ...metric, aggregation: "avg" as const, additivity: "semi_additive" as const, safe: false, explanation: `${metric.explanation} Guarded as semi-additive; do not sum across time without a snapshot rule.` };
    if (!budgetLike) return metric;
    const candidateDimensions = columns.filter(c => c.name !== field && ["text", "geo", "date", "boolean", "identifier"].includes(c.inferredType) && c.unique > 1 && c.unique < rows.length);
    let repeatedWithinDimension = false;
    let repeatedFieldValues = false;
    const normalizedValues = rows.map(r => String(r[field] ?? "")).filter(Boolean);
    repeatedFieldValues = normalizedValues.length >= 3 && new Set(normalizedValues).size <= Math.max(2, Math.ceil(normalizedValues.length * 0.25));
    for (const dim of candidateDimensions) {
      const seen = new Map<string, Set<string>>();
      for (const row of rows) {
        const key = String(row[dim.name] ?? "");
        const value = String(row[field] ?? "");
        if (!key || !value) continue;
        const values = seen.get(key) || new Set<string>(); values.add(value); seen.set(key, values);
      }
      if ([...seen.values()].some(values => values.size === 1) && rows.length > 2) { repeatedWithinDimension = true; break; }
    }
    if (repeatedFieldValues || repeatedWithinDimension) {
      warnings.push({ code: "MIXED_GRAIN_GUARD", column: field, message: `The field ${field} appears repeated at a lower row grain. Auto-summing it is blocked to prevent duplicated budget/target totals.` });
      return { ...metric, additivity: "unknown" as const, safe: false, explanation: "Blocked by the granularity guard: repeated values suggest a higher-grain budget/target could be duplicated across detail rows." };
    }
    return { ...metric, additivity: "unknown" as const, safe: false, explanation: "Budget/target grain has not been declared. Confirm whether values are per row, per month, per region, or per another grain before aggregation." };
  });
  return { registry: { ...registry, metrics, dependencyGraph: { ...registry.dependencyGraph } }, warnings };
}
