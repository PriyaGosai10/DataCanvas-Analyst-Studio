export type Primitive = string | number | boolean | Date | null | undefined;
export type InferredType = "text" | "integer" | "number" | "currency" | "percentage" | "date" | "boolean" | "geo" | "identifier" | "empty";
export type SemanticRole = "revenue" | "cost" | "profit" | "budget" | "quantity" | "rating" | "percentage" | "date" | "geography" | "identifier" | "category" | "measure" | "unknown";
export type Additivity = "additive" | "semi_additive" | "non_additive" | "unknown";
export type Aggregation = "sum" | "avg" | "count" | "min" | "max" | "distinct_count";
export type VisualType = "kpi" | "bar" | "line" | "area" | "donut" | "pie" | "scatter";

export interface SanitizerWarning { code: string; column?: string; message: string; count?: number; }
export interface SanitizedData { rows: Record<string, any>[]; headers: string[]; warnings: SanitizerWarning[]; rowCount: number; }
export interface ColumnProfile {
  name: string; normalizedName: string; inferredType: InferredType; semanticRole: SemanticRole;
  confidence: number; userOverride: boolean; nonEmpty: number; missing: number; missingPercent: number;
  unique: number; cardinality: number; sample: Primitive[]; min?: number; max?: number; mean?: number;
  integerLike?: boolean; sequentialUnique?: boolean; numericParseRate?: number; dateParseRate?: number;
  recommendedAggregation?: Aggregation; additivity: Additivity; reasons: string[];
}
export interface DateTopology {
  column: string; frequency: "hourly" | "daily" | "business_daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "irregular";
  calendarContinuity: number; businessDayContinuity: number; observedPeriods: number; expectedPeriods: number;
  gaps: string[]; hasWeekendGaps: boolean; hasBusinessDayGaps: boolean; confidence: number;
}
export interface SchemaContext {
  version: "1.0.0"; rowCount: number; columnCount: number; columns: Record<string, ColumnProfile>;
  dateTopology: DateTopology[]; warnings: SanitizerWarning[]; sourceHeaders: string[];
}
export interface MetricDefinition {
  id: string; label: string; formula: string; dependencies: string[]; aggregation: Aggregation;
  additivity: Additivity; format: "currency" | "percentage" | "integer" | "decimal" | "date" | "plain";
  confidence: number; explanation: string; safe: boolean;
}
export interface MetricRegistry { version: "1.0.0"; metrics: MetricDefinition[]; dependencyGraph: Record<string, string[]>; }
export interface VisualEncoding { x?: string; y?: string; color?: string; tooltip: string[]; sort?: "value_desc" | "date_asc" | "category_asc"; topN?: number; }
export interface VisualManifestItem {
  id: string; type: VisualType; title: string; component: string; metricId?: string; datasetField?: string;
  aggregation: Aggregation; encodings: VisualEncoding; intent: string; priority: number; overflow: "truncate_others" | "paginate" | "internal_scroll" | "fixed";
  interactionRole: "global_context" | "trend" | "breakdown" | "detail" | "kpi";
}
export interface VisualManifest { version: "1.0.0"; visuals: VisualManifestItem[]; }
export interface GridItem { id: string; x: number; y: number; w: number; h: number; minW: number; minH: number; aspectRatio?: number; overflow: string; }
export interface GridLayoutJSON { columns: 12; gap: 16; breakpoints: { lg: number; md: number; sm: number }; lg: GridItem[]; md: GridItem[]; sm: GridItem[]; }
export interface DesignTokens { id: string; name: string; mode: "light" | "dark"; palette: { primary: string; secondary: string; accent: string; background: string; surface: string; text: string; muted: string; positive: string; negative: string }; fontFamily: string; radius: number; spacing: number; contrastChecked: boolean; }
export interface InteractionScope { listenTo: string[]; ignore: string[]; publish?: string[]; }
export interface InteractionWireframe { version: "1.0.0"; globalFilters: string[]; scopes: Record<string, InteractionScope>; events: { id: string; publisher: string; subscribers: string[]; dimension: string; kind: "filter" | "highlight"; }[]; cycleProtection: "origin-and-event-id"; }
export interface DashboardBlueprint {
  $schema: "https://datacanvas.io/schemas/dashboard-blueprint-1.0.0.json"; blueprintVersion: "1.0.0";
  dashboardId: string; meta: { engineEdition: string; generationMode: "auto" | "guided"; createdAt: string; seed: string; };
  schemaContext: SchemaContext; metricRegistry: MetricRegistry; visualManifest: VisualManifest;
  gridLayout: GridLayoutJSON; designTokens: DesignTokens; interactionWireframe: InteractionWireframe;
  generationNotes: string[];
}
export interface GenerationOptions { mode?: "auto" | "guided"; purpose?: "executive" | "exploration" | "insights"; title?: string; theme?: "light" | "dark"; primaryColor?: string; fontFamily?: string; pinnedFields?: string[]; excludedFields?: string[]; maxVisuals?: number; variantIndex?: number; generationKey?: string; }
