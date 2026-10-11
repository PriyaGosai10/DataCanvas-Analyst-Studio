import { ColumnProfile, MetricDefinition, VisualManifest, VisualManifestItem } from "./types";
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
export function selectVisuals(columns: ColumnProfile[], metrics: MetricDefinition[], maxVisuals = 7, purpose: "executive" | "exploration" | "insights" = "executive", variantIndex = 0): VisualManifest {
  const visuals: VisualManifestItem[] = [];
  const add = (v: Omit<VisualManifestItem, "id" | "component">) => {
    if (visuals.length >= maxVisuals || visuals.some(x => x.title === v.title && x.type === v.type)) return;
    visuals.push({ ...v, id: `viz_${slug(v.title)}_${visuals.length + 1}`, component: v.type === "kpi" ? "MetricCard" : v.type === "bar" ? "RankedBarChart" : v.type === "line" ? "TimeSeriesChart" : v.type === "area" ? "TrendAreaChart" : v.type === "donut" || v.type === "pie" ? "CompositionChart" : "ScatterPlot" });
  };
  const usableMetrics = metrics.filter(m => m.safe && m.dependencies.length === 1 && m.aggregation !== "count");
  const roleScore: Record<string, number> = { revenue: 100, profit: 90, quantity: 80, cost: 70, budget: 40, measure: 30, percentage: 20 };
  const fieldPriority = (c: ColumnProfile) => (roleScore[c.semanticRole] || 0) + c.confidence * 10 + (c.inferredType === "currency" ? 12 : 0);
  const metricPriority = (m: MetricDefinition) => {
    const c = columns.find(col => col.name === m.dependencies[0]);
    return (c ? fieldPriority(c) : 0) + (m.label.toLowerCase().includes("revenue") ? 20 : 0);
  };
  const rankedMetrics = [...usableMetrics].sort((a, b) => metricPriority(b) - metricPriority(a));
  const chosenMetrics = rankedMetrics;
  const dates = columns.filter(c => c.inferredType === "date" && c.confidence >= 0.7).sort((a, b) => b.confidence - a.confidence);
  // Numeric values are not categorical dimensions by default. Permit only explicit category/rating roles.
  const dims = columns.filter(c => {
    if (c.semanticRole === "identifier" || c.unique <= 1 || c.cardinality >= 0.95 || c.inferredType === "date") return false;
    if (["text", "geo", "boolean"].includes(c.inferredType)) return true;
    return c.semanticRole === "category" || c.semanticRole === "rating";
  });
  const measures = columns.filter(c => ["integer", "number", "currency"].includes(c.inferredType) && c.semanticRole !== "identifier" && c.semanticRole !== "percentage" && !c.sequentialUnique && c.semanticRole !== "rating" && c.additivity !== "unknown");
  measures.sort((a, b) => fieldPriority(b) - fieldPriority(a));
  const primary = measures[0];
  const date = dates[0];
  const categoryCandidates = [...dims].sort((a, b) => {
    const categoryScore = (c: ColumnProfile) => (c.semanticRole === "geography" ? 40 : c.semanticRole === "category" ? 20 : 0) + (c.unique >= 2 && c.unique <= 12 ? 20 : c.unique <= 30 ? 10 : 0) + (c.cardinality < 0.7 ? 8 : 0) + c.confidence;
    return categoryScore(b) - categoryScore(a);
  });
  const category = categoryCandidates[0];
  const secondary = measures.find(c => c.name !== primary?.name && c.additivity === "additive");
  const lowCardinality = categoryCandidates.find(c => c.unique >= 2 && c.unique <= 5 && c.name !== category?.name);

  // The three pages answer different questions; they share the same semantics but not the same information architecture.
  if (purpose === "executive") {
    chosenMetrics.slice(0, 4).forEach(m => add({ type: "kpi", title: m.label, metricId: m.id, datasetField: m.dependencies[0], aggregation: m.aggregation, encodings: { tooltip: m.dependencies }, intent: "executive_metric", priority: 100, overflow: "fixed", interactionRole: "kpi" }));
    if (date && primary) add({ type: "line", title: `${primary.name} over time`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: date.name, y: primary.name, tooltip: [date.name, primary.name], sort: "date_asc" }, intent: "trend_over_time", priority: 90, overflow: "fixed", interactionRole: "trend" });
    if (category && primary) add({ type: "bar", title: `${primary.name} by ${category.name}`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: category.name, y: primary.name, color: category.name, tooltip: [category.name, primary.name], sort: "value_desc", topN: 8 }, intent: "executive_breakdown", priority: 80, overflow: "paginate", interactionRole: "breakdown" });
    if (lowCardinality && primary) add({ type: "donut", title: `${primary.name} mix by ${lowCardinality.name}`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: lowCardinality.name, y: primary.name, color: lowCardinality.name, tooltip: [lowCardinality.name, primary.name], sort: "value_desc", topN: 5 }, intent: "composition", priority: 60, overflow: "paginate", interactionRole: "breakdown" });
  } else if (purpose === "exploration") {
    chosenMetrics.slice(0, 2).forEach(m => add({ type: "kpi", title: m.label, metricId: m.id, datasetField: m.dependencies[0], aggregation: m.aggregation, encodings: { tooltip: m.dependencies }, intent: "exploration_context", priority: 80, overflow: "fixed", interactionRole: "kpi" }));
    if (primary && secondary) add({ type: "scatter", title: `${primary.name} relationship with ${secondary.name}`, datasetField: secondary.name, aggregation: "avg", encodings: { x: primary.name, y: secondary.name, tooltip: [primary.name, secondary.name] }, intent: "relationship_exploration", priority: 75, overflow: "paginate", interactionRole: "detail" });
    if (category && primary) add({ type: "bar", title: `${primary.name} across ${category.name}`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: category.name, y: primary.name, color: category.name, tooltip: [category.name, primary.name], sort: "value_desc", topN: 15 }, intent: "category_exploration", priority: 70, overflow: "paginate", interactionRole: "breakdown" });
    if (date && primary) add({ type: "line", title: `${primary.name} time-series detail`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: date.name, y: primary.name, tooltip: [date.name, primary.name], sort: "date_asc" }, intent: "time_series_exploration", priority: 65, overflow: "internal_scroll", interactionRole: "trend" });
    if (lowCardinality && secondary) add({ type: "bar", title: `${secondary.name} across ${lowCardinality.name}`, datasetField: secondary.name, aggregation: secondary.recommendedAggregation || "sum", encodings: { x: lowCardinality.name, y: secondary.name, tooltip: [lowCardinality.name, secondary.name], sort: "value_desc", topN: 12 }, intent: "secondary_measure_exploration", priority: 55, overflow: "paginate", interactionRole: "detail" });
  } else {
    chosenMetrics.slice(0, 2).forEach(m => add({ type: "kpi", title: m.label, metricId: m.id, datasetField: m.dependencies[0], aggregation: m.aggregation, encodings: { tooltip: m.dependencies }, intent: "risk_context_metric", priority: 85, overflow: "fixed", interactionRole: "kpi" }));
    if (category && primary) add({ type: "bar", title: `Largest ${primary.name} differences by ${category.name}`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: category.name, y: primary.name, color: category.name, tooltip: [category.name, primary.name], sort: "value_desc", topN: 8 }, intent: "risk_comparison", priority: 90, overflow: "paginate", interactionRole: "breakdown" });
    if (date && primary) add({ type: "area", title: `${primary.name} trend and change points`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: date.name, y: primary.name, tooltip: [date.name, primary.name], sort: "date_asc" }, intent: "risk_trend", priority: 80, overflow: "fixed", interactionRole: "trend" });
    if (secondary && category) add({ type: "bar", title: `${secondary.name} by ${category.name} for review`, datasetField: secondary.name, aggregation: secondary.recommendedAggregation || "sum", encodings: { x: category.name, y: secondary.name, tooltip: [category.name, secondary.name], sort: "value_desc", topN: 8 }, intent: "secondary_risk_signal", priority: 70, overflow: "paginate", interactionRole: "detail" });
    if (lowCardinality && primary) add({ type: "donut", title: `${primary.name} concentration across ${lowCardinality.name}`, datasetField: primary.name, aggregation: primary.recommendedAggregation || "sum", encodings: { x: lowCardinality.name, y: primary.name, color: lowCardinality.name, tooltip: [lowCardinality.name, primary.name], sort: "value_desc", topN: 5 }, intent: "concentration_review", priority: 60, overflow: "paginate", interactionRole: "breakdown" });
  }
  // Category-only files are still analyzable: show record counts instead of failing dashboard generation.
  if (!visuals.length && category) add({ type: "bar", title: `Records by ${category.name}`, datasetField: category.name, aggregation: "count", encodings: { x: category.name, y: category.name, color: category.name, tooltip: [category.name], sort: "value_desc", topN: 12 }, intent: "category_record_count", priority: 100, overflow: "paginate", interactionRole: "breakdown" });
  if (!visuals.length && primary) add({ type: "kpi", title: primary.name, datasetField: primary.name, aggregation: primary.recommendedAggregation || "avg", encodings: { tooltip: [primary.name] }, intent: "single_metric", priority: 100, overflow: "fixed", interactionRole: "kpi" });
  return { version: "1.0.0", visuals: visuals.slice(0, maxVisuals) };
}
