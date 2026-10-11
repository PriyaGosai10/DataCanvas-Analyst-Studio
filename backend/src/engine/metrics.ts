import { ColumnProfile, MetricDefinition, MetricRegistry } from "./types";
function safeId(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
export function synthesizeMetrics(columns: ColumnProfile[], pinnedFields: string[] = []): MetricRegistry {
  const metrics: MetricDefinition[] = [];
  const add = (metric: MetricDefinition) => { if (!metrics.some(m => m.id === metric.id)) metrics.push(metric); };
  const usable = columns.filter(c => ["integer", "number", "currency"].includes(c.inferredType) && c.semanticRole !== "identifier" && c.semanticRole !== "percentage" && !c.sequentialUnique && c.semanticRole !== "rating");
  for (const c of usable) {
    const sumSafe = c.additivity === "additive" && !["percentage", "rating"].includes(c.semanticRole) && c.inferredType !== "percentage";
    const aggregation = sumSafe ? "sum" : "avg";
    const format = c.inferredType === "currency" || ["revenue", "cost", "profit", "budget"].includes(c.semanticRole) ? "currency" : c.inferredType === "percentage" || c.semanticRole === "percentage" ? "percentage" : c.integerLike ? "integer" : "decimal";
    add({ id: `metric_${safeId(c.name)}`, label: c.semanticRole === "revenue" ? "Total Revenue" : c.semanticRole === "profit" ? "Total Profit" : c.semanticRole === "cost" ? "Total Cost" : `${aggregation === "sum" ? "Total" : "Average"} ${c.name}`, formula: `${aggregation.toUpperCase()}(${c.name})`, dependencies: [c.name], aggregation, additivity: c.additivity, format, confidence: c.confidence, explanation: c.reasons.join(" ") || `Generated from numeric column ${c.name}.`, safe: c.additivity !== "unknown" });
  }
  const byRole = (role: string) => usable.find(c => c.semanticRole === role);
  const revenue = byRole("revenue"), cost = byRole("cost"), profit = byRole("profit");
  if (revenue && cost) add({ id: "metric_derived_profit", label: "Estimated Profit", formula: `SUM(${revenue.name}) - SUM(${cost.name})`, dependencies: [revenue.name, cost.name], aggregation: "sum", additivity: "additive", format: "currency", confidence: Math.min(revenue.confidence, cost.confidence), explanation: "Derived as revenue minus cost; confirm both fields use compatible grain and currency.", safe: revenue.additivity === "additive" && cost.additivity === "additive" });
  const profitSource = profit || (revenue && cost ? null : undefined);
  if (revenue && (profit || (revenue && cost))) {
    const profitExpr = profit ? `SUM(${profit.name})` : `SUM(${revenue.name}) - SUM(${cost!.name})`;
    add({ id: "metric_profit_margin", label: "Profit Margin", formula: `SAFE_DIVIDE(${profitExpr}, SUM(${revenue.name})) * 100`, dependencies: profit ? [profit.name, revenue.name] : [revenue.name, cost!.name], aggregation: "avg", additivity: "non_additive", format: "percentage", confidence: Math.min(revenue.confidence, profit?.confidence ?? cost!.confidence), explanation: "Ratio metric; compute from aggregated compatible-grain profit and revenue, with zero-denominator protection.", safe: revenue.additivity === "additive" && (profit ? profit.additivity === "additive" : cost!.additivity === "additive") });
  }
  for (const field of pinnedFields) {
    const c = columns.find(x => x.name === field);
    if (c && !metrics.some(m => m.dependencies.length === 1 && m.dependencies[0] === field)) add({ id: `metric_pinned_${safeId(field)}`, label: field, formula: `${c.recommendedAggregation?.toUpperCase() || "COUNT"}(${field})`, dependencies: [field], aggregation: c.recommendedAggregation || "count", additivity: c.additivity, format: "plain", confidence: c.confidence, explanation: "Pinned by the user; review aggregation before interpreting the result.", safe: c.additivity !== "unknown" });
  }
  return { version: "1.0.0", metrics, dependencyGraph: Object.fromEntries(metrics.map(m => [m.id, m.dependencies])) };
}
