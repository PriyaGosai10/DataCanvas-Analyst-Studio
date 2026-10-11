import { createHash } from "crypto";
import { DashboardBlueprint, GenerationOptions, SanitizedData } from "./types";
import { sanitizeRows } from "./sanitizer";
import { profileSanitized } from "./profiler";
import { synthesizeMetrics } from "./metrics";
import { selectVisuals } from "./chartMatrix";
import { createGridLayout } from "./layout";
import { createDesignTokens } from "./theme";
import { planInteractions } from "./interactions";
import { applyGranularityGuard } from "./granularityGuard";

export function buildDashboardBlueprint(inputRows: Record<string, any>[], dashboardId: string, options: GenerationOptions = {}, originalHeaders?: string[]): { blueprint: DashboardBlueprint; sanitized: SanitizedData } {
  const sanitized = sanitizeRows(inputRows, originalHeaders);
  if (!sanitized.rows.length || !sanitized.headers.length) throw new Error("No usable rows and columns were found after data sanitization.");
  const schemaContext = profileSanitized(sanitized);
  const synthesized = synthesizeMetrics(Object.values(schemaContext.columns), options.pinnedFields || []);
  const guarded = applyGranularityGuard(synthesized, Object.values(schemaContext.columns), sanitized.rows);
  const metricRegistry = guarded.registry;
  schemaContext.warnings.push(...guarded.warnings);
  const maxVisuals = Math.max(1, Math.min(7, Math.floor(options.maxVisuals || 7)));
  const visualManifest = selectVisuals(Object.values(schemaContext.columns).filter(c => !(options.excludedFields || []).includes(c.name)), metricRegistry.metrics, maxVisuals, options.purpose || "executive", Number(options.variantIndex || 0) % 3);
  if (!visualManifest.visuals.length) throw new Error("No suitable visual could be generated. Choose a numeric field or change the field-role overrides.");
  const gridLayout = createGridLayout(visualManifest.visuals);
  const seed = createHash("sha256").update(JSON.stringify({ dashboardId, headers: sanitized.headers, rowCount: sanitized.rowCount, options, generationKey: options.generationKey || "initial" })).digest("hex").slice(0, 16);
  const variant = parseInt(seed.slice(0, 4), 16);
  const designTokens = createDesignTokens(options.theme || "light", options.primaryColor, options.fontFamily, variant);
  const dateFields = schemaContext.dateTopology.map(d => d.column);
  const categoryFields = Object.values(schemaContext.columns).filter(c => ["text", "geo", "boolean"].includes(c.inferredType) && c.semanticRole !== "identifier").map(c => c.name);
  const interactionWireframe = planInteractions(visualManifest.visuals, dateFields, categoryFields);
  const generationNotes = [
    `Generated deterministically from ${sanitized.rowCount} rows and ${sanitized.headers.length} columns.`,
    "No paid LLM or external AI service was used.",
    "Review low-confidence classifications and all metrics whose grain is unknown before business use.",
    ...schemaContext.warnings.map(w => w.message),
    ...Object.values(schemaContext.columns).filter(c => c.additivity === "unknown").map(c => `Aggregation review required for ${c.name}: grain/additivity is unknown.`),
    ...Object.values(schemaContext.columns).filter(c => c.semanticRole === "percentage" || c.inferredType === "percentage").map(c => `Rate/ratio field ${c.name} was excluded from default additive KPIs because a valid numerator/denominator definition is required; do not average row-level rates without confirming the business formula.`)
  ];
  const blueprint: DashboardBlueprint = { $schema: "https://datacanvas.io/schemas/dashboard-blueprint-1.0.0.json", blueprintVersion: "1.0.0", dashboardId, meta: { engineEdition: "1.0.4", generationMode: options.mode || "auto", createdAt: new Date().toISOString(), seed }, schemaContext, metricRegistry, visualManifest, gridLayout, designTokens, interactionWireframe, generationNotes };
  return { blueprint, sanitized };
}
