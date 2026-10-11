import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../services/api";
import {
  ArrowLeft, Plus, Save, Trash2, Share2, History, Copy, GripVertical, AlertTriangle,
  ZoomIn, ZoomOut, Printer, RefreshCw, Layers, Filter, Link2, RotateCcw,
  BarChart3, LineChart as LineIcon, PieChart as PieIcon, ScatterChart as ScatterIcon,
  Table2, LayoutDashboard, Palette, Settings2, Wand2, Download, X
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, ScatterChart, Scatter,
  Legend
} from "recharts";

const palette = ["#2563eb", "#7c3aed", "#0f766e", "#ea580c", "#db2777", "#0891b2", "#65a30d", "#ca8a04"];
const chartTypes = ["bar", "line", "area", "donut", "pie", "scatter", "kpi"];

function formatAxisLabel(value: any) {
  const text = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text) || /GMT|T\d{2}:\d{2}/i.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return text.length > 18 ? `${text.slice(0, 16)}…` : text;
}

function formatMetric(value: number, fieldName: string) {
  const isCurrency = /sales|revenue|profit|cost|price|amount|income|expense|spend|turnover|budget/i.test(fieldName);
  const abs = Math.abs(value);
  const compact = abs >= 1_000_000_000 ? `${(value / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}B`
    : abs >= 1_000_000 ? `${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`
    : abs >= 100_000 ? `${(value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  // Never assume USD for an unknown dataset. Show a currency symbol only when the field name itself identifies a currency.
  const indianCurrency = /\b(inr|rupee|rupees)\b/i.test(fieldName) || /₹/.test(fieldName);
  return isCurrency ? `${indianCurrency ? "₹" : ""}${compact}` : compact;
}

function Chart({ v, data }: { v: any; data: any[] }) {
  if (v.type === "kpi") {
    const value = data[0]?.value;
    const numericValue = value === undefined || value === null || !Number.isFinite(Number(value)) ? null : Number(value);
    const fullValue = numericValue === null ? "No valid numeric values available for this metric" : numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const lineage = (data[0]?.sourceRows || []).map((r: any) => `${r.worksheet} · row ${r.rowNumber}`).join("\n");
    const displayedValue = numericValue === null ? "No data" : v.style?.measureFormat === "percentage" ? `${numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : formatMetric(numericValue, String(v.yField || v.title || ""));
    return <div className="kpi-value" title={`${fullValue}\nSource rows: ${data[0]?.sourceRowCount || 0}\n${lineage}`}>{displayedValue}</div>;
  }
  if (!data.length) return <div className="chart-empty">No valid data for this chart. Check the selected fields and filters.</div>;
  const common = { margin: { top: 8, right: 12, left: 0, bottom: 8 } };
  return <ResponsiveContainer width="100%" height="100%">
    {v.type === "line" ? <LineChart data={data} {...common}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tickFormatter={formatAxisLabel} tick={{fontSize:11}} minTickGap={16}/><YAxis tick={{fontSize:11}}/><Tooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="custom-tooltip" style={{background:"var(--panel,#fff)",border:"1px solid var(--border,#ddd)",padding:10,borderRadius:8,maxWidth:320}}><strong>{String(label ?? payload[0]?.payload?.name ?? "Value")}</strong><div>{Number(payload[0]?.value ?? 0).toLocaleString(undefined,{maximumFractionDigits:3})}</div><small>{payload[0]?.payload?.sourceRowCount || 0} source rows</small>{(payload[0]?.payload?.sourceRows || []).slice(0,8).map((r:any,i:number)=><div key={i}><small>{r.worksheet} · row {r.rowNumber}</small></div>)}</div> : null}/><Line type="monotone" dataKey="value" stroke={v.style?.color || palette[0]} strokeWidth={3} dot={false}/></LineChart> :
    v.type === "area" ? <AreaChart data={data} {...common}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tickFormatter={formatAxisLabel} tick={{fontSize:11}} minTickGap={16}/><YAxis tick={{fontSize:11}}/><Tooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="custom-tooltip" style={{background:"var(--panel,#fff)",border:"1px solid var(--border,#ddd)",padding:10,borderRadius:8,maxWidth:320}}><strong>{String(label ?? payload[0]?.payload?.name ?? "Value")}</strong><div>{Number(payload[0]?.value ?? 0).toLocaleString(undefined,{maximumFractionDigits:3})}</div><small>{payload[0]?.payload?.sourceRowCount || 0} source rows</small>{(payload[0]?.payload?.sourceRows || []).slice(0,8).map((r:any,i:number)=><div key={i}><small>{r.worksheet} · row {r.rowNumber}</small></div>)}</div> : null}/><Area type="monotone" dataKey="value" stroke={v.style?.color || palette[0]} fill={v.style?.color || palette[0]} fillOpacity={0.16}/></AreaChart> :
    (v.type === "donut" || v.type === "pie") ? <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={v.type === "donut" ? 62 : 0} outerRadius={92} paddingAngle={v.type === "donut" ? 3 : 0}>{data.map((_: any, i: number) => <Cell key={i} fill={palette[i % palette.length]}/>)}</Pie><Tooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="custom-tooltip" style={{background:"var(--panel,#fff)",border:"1px solid var(--border,#ddd)",padding:10,borderRadius:8,maxWidth:320}}><strong>{String(label ?? payload[0]?.payload?.name ?? "Value")}</strong><div>{Number(payload[0]?.value ?? 0).toLocaleString(undefined,{maximumFractionDigits:3})}</div><small>{payload[0]?.payload?.sourceRowCount || 0} source rows</small>{(payload[0]?.payload?.sourceRows || []).slice(0,8).map((r:any,i:number)=><div key={i}><small>{r.worksheet} · row {r.rowNumber}</small></div>)}</div> : null}/><Legend wrapperStyle={{fontSize:11}}/></PieChart> :
    v.type === "scatter" ? <ScatterChart {...common}><CartesianGrid/><XAxis dataKey="name" tickFormatter={formatAxisLabel} tick={{fontSize:11}} minTickGap={16}/><YAxis dataKey="value" tick={{fontSize:11}}/><Tooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="custom-tooltip" style={{background:"var(--panel,#fff)",border:"1px solid var(--border,#ddd)",padding:10,borderRadius:8,maxWidth:320}}><strong>{String(label ?? payload[0]?.payload?.name ?? "Value")}</strong><div>{Number(payload[0]?.value ?? 0).toLocaleString(undefined,{maximumFractionDigits:3})}</div><small>{payload[0]?.payload?.sourceRowCount || 0} source rows</small>{(payload[0]?.payload?.sourceRows || []).slice(0,8).map((r:any,i:number)=><div key={i}><small>{r.worksheet} · row {r.rowNumber}</small></div>)}</div> : null}/><Scatter data={data} fill={v.style?.color || palette[0]}/></ScatterChart> :
    <BarChart data={data} {...common}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tickFormatter={formatAxisLabel} tick={{fontSize:11}} interval={data.length > 12 ? "preserveStartEnd" : 0} angle={data.length > 7 ? -20 : 0} textAnchor={data.length > 7 ? "end" : "middle"} height={data.length > 7 ? 55 : 30}/><YAxis tick={{fontSize:11}}/><Tooltip content={({ active, payload, label }: any) => active && payload?.length ? <div className="custom-tooltip" style={{background:"var(--panel,#fff)",border:"1px solid var(--border,#ddd)",padding:10,borderRadius:8,maxWidth:320}}><strong>{String(label ?? payload[0]?.payload?.name ?? "Value")}</strong><div>{Number(payload[0]?.value ?? 0).toLocaleString(undefined,{maximumFractionDigits:3})}</div><small>{payload[0]?.payload?.sourceRowCount || 0} source rows</small>{(payload[0]?.payload?.sourceRows || []).slice(0,8).map((r:any,i:number)=><div key={i}><small>{r.worksheet} · row {r.rowNumber}</small></div>)}</div> : null}/><Bar dataKey="value" fill={v.style?.color || palette[0]} radius={[6,6,0,0]}/></BarChart>}
  </ResponsiveContainer>;
}

function countUniqueLineage(items: any[]) {
  const refs = new Set<string>();
  for (const item of items || []) for (const ref of item?.sourceRows || []) {
    if (ref?.worksheet && Number.isFinite(Number(ref.rowNumber))) refs.add(`${ref.worksheet}:${Number(ref.rowNumber)}`);
  }
  return refs.size;
}

function chartIcon(type: string) {
  if (type === "bar") return <BarChart3 size={16}/>;
  if (type === "line" || type === "area") return <LineIcon size={16}/>;
  if (type === "pie" || type === "donut") return <PieIcon size={16}/>;
  if (type === "scatter") return <ScatterIcon size={16}/>;
  if (type === "kpi") return <span className="metric-icon">123</span>;
  return <Table2 size={16}/>;
}

export default function Dashboard() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>();
  const [datasets, setDatasets] = useState<any[]>([]);
  const [relatedProfile, setRelatedProfile] = useState<any[]>([]);
  const [relatedSample, setRelatedSample] = useState<any[]>([]);
  const [visuals, setVisuals] = useState<any[]>([]);
  const [chartData, setChartData] = useState<Record<string, any[]>>({});
  const [insightData, setInsightData] = useState<any>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [generationQualityWarnings, setGenerationQualityWarnings] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ type: "bar", title: "New visualization", xField: "", yField: "", measureId: "", datasetId: "", aggregation: "sum", color: palette[0] });
  const [selectedPage, setSelectedPage] = useState("page-1");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [versions, setVersions] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [activeTab, setActiveTab] = useState<"build" | "style">("build");
  const [selectedVisual, setSelectedVisual] = useState<string>("");
  const [building, setBuilding] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const canvasRef = useRef<HTMLElement | null>(null);
  const [layoutStyle, setLayoutStyle] = useState<"powerbi" | "executive" | "midnight">(() => {
    const saved = localStorage.getItem(`datacanvas_layout_${id}`);
    return saved === "executive" || saved === "midnight" ? saved : "powerbi";
  });
  function chooseLayoutStyle(style: "powerbi" | "executive" | "midnight") {
    setLayoutStyle(style);
    localStorage.setItem(`datacanvas_layout_${id}`, style);
  }

  async function load() {
    const r = await api.get(`/dashboards/${id}`);
    setData(r.data);
    setVisuals(r.data.visuals || []);
    setFilters(r.data.dashboard.filters || {});
    const ds = await api.get(`/datasets/project/${r.data.dashboard.projectId}`);
    setDatasets(ds.data);
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    document.body.classList.toggle("datacanvas-report-mode", reportMode);
    return () => document.body.classList.remove("datacanvas-report-mode");
  }, [reportMode]);
  // Return to the editor after the browser's PDF/print dialog closes.
  useEffect(() => {
    const handleAfterPrint = () => setReportMode(false);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const ds = datasets.find(x => x._id === form.datasetId);
  const isUsableColumn = (c: any) => c.type !== "empty" && !/^_?empty(?:_\d+)?$/i.test(String(c.name || "").trim()) && !/^unnamed(?::?\s*\d+)?$/i.test(String(c.name || "").trim());
  const combinedProfile = [...(ds?.columnProfile || []), ...relatedProfile, ...((ds?.calculatedColumns || []).filter((c: any) => c.active).map((c: any) => ({ name: c.name, type: "number" })))];
  const numeric = combinedProfile.filter((c: any) => c.type === "number" && isUsableColumn(c));
  const activeMeasures = (ds?.calculatedMeasures || []).filter((m: any) => m.active);
  const chosenMeasure = activeMeasures.find((m: any) => m.id === form.measureId);
  const categorical = combinedProfile.filter((c: any) => (c.type === "text" || c.type === "date" || c.type === "boolean") && isUsableColumn(c));
  useEffect(() => {
    if (!ds?._id) { setRelatedProfile([]); setRelatedSample([]); return; }
    let cancelled = false;
    api.post(`/analytics/${ds._id}/rows`, { limit: 100, offset: 0 }).then((response) => {
      if (cancelled) return;
      const rows = response.data?.rows || [];
      setRelatedSample(rows);
      const fields = Object.keys(rows[0] || {}).filter((name) => name.includes("."));
      const inferred = fields.map((name) => {
        const values = rows.map((row: any) => row[name]).filter((value: any) => value !== null && value !== undefined && value !== "");
        const allNumeric = values.length > 0 && values.every((value: any) => typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))));
        const allDates = values.length > 0 && values.every((value: any) => !Number.isNaN(Date.parse(String(value))) && /date|time|year|month/i.test(name));
        return { name, type: allDates ? "date" : allNumeric ? "number" : "text" };
      });
      setRelatedProfile(inferred);
    }).catch(() => { if (!cancelled) { setRelatedProfile([]); setRelatedSample([]); } });
    return () => { cancelled = true; };
  }, [ds?._id, JSON.stringify(ds?.relationships || []), ds?.selectedSheet]);
  useEffect(() => {
    if (!form.datasetId && datasets[0]) setForm((f: any) => ({ ...f, datasetId: datasets[0]._id }));
  }, [datasets]);
  useEffect(() => {
    if (!form.datasetId) { setInsightData(null); return; }
    let cancelled = false;
    setInsightLoading(true); setInsightError("");
    api.post(`/analytics/${form.datasetId}/insights`, { filters }).then(r => { if (!cancelled) setInsightData(r.data); })
      .catch(e => { if (!cancelled) setInsightError(e?.response?.data?.message || "Data intelligence could not be loaded."); })
      .finally(() => { if (!cancelled) setInsightLoading(false); });
    return () => { cancelled = true; };
  }, [form.datasetId, JSON.stringify(filters)]);
  useEffect(() => {
    if (ds) setForm((f: any) => ({ ...f,
      xField: f.xField || categorical[0]?.name || combinedProfile[0]?.name || "",
      yField: f.yField || numeric[0]?.name || ""
    }));
  }, [form.datasetId, relatedProfile.length]);

  const pages = data?.dashboard?.pages || [{ id: "page-1", name: "Overview" }];
  const pageVisuals = visuals.filter(v => (v.pageId || "page-1") === selectedPage).sort((a, b) => (a.position?.order || 0) - (b.position?.order || 0));
  const selected = visuals.find(v => v._id === selectedVisual);
  const filterFields = useMemo(() => combinedProfile.filter((c: any) => c.type !== "empty" && !/^_?empty(?:_\d+)?$/i.test(String(c.name || "").trim()) && !/^unnamed(?::?\s*\d+)?$/i.test(String(c.name || "").trim())).slice(0, 4), [ds, relatedProfile]);

  async function refreshCharts(items = visuals, currentFilters = filters) {
    const next: Record<string, any[]> = {};
    await Promise.all(items.map(async v => {
      try {
        const sourceDataset = datasets.find((d: any) => d._id === v.datasetId);
        const validNames = new Set((sourceDataset?.columnProfile || []).map((c: any) => c.name));
        const activeRelationships = (sourceDataset?.relationships || []).filter((relationship: any) => relationship.active);
        const reachableSheets = new Set<string>([String(sourceDataset?.selectedSheet || "")]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const relationship of activeRelationships) {
            if (reachableSheets.has(relationship.leftSheet) && !reachableSheets.has(relationship.rightSheet)) { reachableSheets.add(relationship.rightSheet); grew = true; }
            if (reachableSheets.has(relationship.rightSheet) && !reachableSheets.has(relationship.leftSheet)) { reachableSheets.add(relationship.leftSheet); grew = true; }
          }
        }
        const safeFilters = Object.fromEntries(Object.entries(currentFilters).filter(([key, value]) => {
          if (value === "" || value === undefined) return false;
          if (validNames.has(key)) return true;
          const separator = key.indexOf(".");
          return separator > 0 && reachableSheets.has(key.slice(0, separator));
        }));
        const r = await api.post(`/analytics/${v.datasetId}/aggregate`, {
          xField: v.xField, yField: v.yField, measureId: v.measureId || undefined, aggregation: v.aggregation || "sum", filters: safeFilters, type: v.type, topN: v.style?.encodings?.topN || 100, overflow: v.style?.overflow || "paginate"
        });
        next[v._id] = r.data.data;
      } catch { next[v._id] = []; }
    }));
    setChartData(next);
  }
  useEffect(() => { if (visuals.length) refreshCharts(visuals, filters); }, [visuals, JSON.stringify(filters)]);

  function flash(s: string) { setStatus(s); setTimeout(() => setStatus(""), 2600); }

  async function add() {
    if (!form.datasetId) return flash("Select a dataset first");
    if (form.type !== "kpi" && !form.xField) return flash("Select a category field");
    if (!form.measureId && !form.yField) return flash("Select a numeric field or saved measure");
    const r = await api.post("/visualizations", {
      dashboardId: id, datasetId: form.datasetId, type: form.type, title: form.title || "Untitled visualization",
      xField: form.xField, yField: form.measureId ? "" : form.yField, measureId: form.measureId || "", aggregation: form.aggregation, pageId: selectedPage,
      position: { order: visuals.length, width: form.type === "kpi" ? 3 : 6, height: form.type === "kpi" ? 1 : 2 },
      style: { color: form.color, measureFormat: chosenMeasure?.format }
    });
    setVisuals(v => [...v, r.data]);
    setSelectedVisual(r.data._id);
    flash("Visualization added to canvas");
  }

  async function updateVisual(v: any, patch: any) {
    const r = await api.put(`/visualizations/${v._id}`, patch);
    setVisuals(items => items.map(x => x._id === v._id ? r.data : x));
  }
  async function remove(v: any) {
    if (!confirm(`Delete ${v.title}?`)) return;
    await api.delete(`/visualizations/${v._id}`);
    setVisuals(items => items.filter(x => x._id !== v._id));
    if (selectedVisual === v._id) setSelectedVisual("");
    flash("Visualization deleted");
  }
  async function duplicate(v: any) {
    const r = await api.post(`/visualizations/${v._id}/duplicate`);
    setVisuals(items => [...items, r.data]);
    flash("Visualization duplicated");
  }

  async function autoBuild() {
    const target = datasets.find((d: any) => d._id === form.datasetId) || datasets[0];
    if (!target) return flash("Upload a dataset first");
    if (building) return;
    setBuilding(true);
    const designs = [
      { id: "design-executive", name: "Executive Overview", purpose: "executive", theme: "light", color: "#0f766e", maxVisuals: 7 },
      { id: "design-exploration", name: "Exploratory Analytics", purpose: "exploration", theme: "light", color: "#2563eb", maxVisuals: 7 },
      { id: "design-insights", name: "Insights, Risks & Actions", purpose: "insights", theme: "dark", color: "#7c3aed", maxVisuals: 7 }
    ];
    try {
      // Filters from a different dataset must never blank a newly generated report.
      const targetColumns = new Set((target.columnProfile || []).map((c: any) => c.name));
      const compatibleFilters = Object.fromEntries(Object.entries(filters).filter(([key, value]) => targetColumns.has(key) && value !== ""));
      setFilters(compatibleFilters);
      await updateDashboard({ filters: compatibleFilters });
      const existing = data?.dashboard?.pages || [];
      const otherPages = existing.filter((p: any) => !String(p.id).startsWith("design-"));
      const nextPages = [...otherPages, ...designs.map(({ id, name }) => ({ id, name }))];
      await updateDashboard({ pages: nextPages });
      const allGenerated: any[] = [];
      let warnings = 0;
      const warningDetails: any[] = [];
      const generationKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      for (const design of designs) {
        const r = await api.post(`/dashboards/${id}/generate`, {
          datasetId: target._id,
          pageId: design.id,
          mode: "auto",
          options: { purpose: design.purpose, title: design.name, theme: design.theme, primaryColor: design.color, maxVisuals: design.maxVisuals, generationKey, variantIndex: 0 }
        });
        allGenerated.push(...(r.data.visuals || []));
        const currentWarnings = r.data.sanitizer?.warnings || [];
        warnings += currentWarnings.length;
        for (const warning of currentWarnings) {
          const key = typeof warning === "string" ? warning : `${warning.code || "QUALITY"}:${warning.column || ""}:${warning.message || ""}`;
          if (!warningDetails.some(item => (typeof item === "string" ? item : `${item.code || "QUALITY"}:${item.column || ""}:${item.message || ""}`) === key)) warningDetails.push(warning);
        }
      }
      setGenerationQualityWarnings(warningDetails);
      setVisuals((current: any[]) => [...current.filter(v => !designs.some(d => d.id === (v.pageId || "page-1"))), ...allGenerated]);
      setSelectedPage("design-executive");
      setSelectedVisual(allGenerated.find(v => v.pageId === "design-executive")?._id || "");
      setData((current: any) => current ? { ...current, dashboard: { ...current.dashboard, pages: nextPages, blueprint: current.dashboard.blueprint } } : current);
      setLayoutStyle("powerbi");
      flash(`Generated 3 dashboard designs from ${target.originalName}${warnings ? ` · ${warnings} data-quality warning(s)` : ""}`);
    } catch (error: any) {
      flash(error?.response?.data?.message || "Dashboard generation failed. Check the backend terminal.");
    } finally { setBuilding(false); }
  }

  async function saveVersion() { const r = await api.post(`/versions/${id}`); setVersions(v => [r.data, ...v]); flash(`Version ${r.data.version} saved`); }
  async function exportPdf(openInTab = false) {
    const target = canvasRef.current;
    if (!target || exportingPdf) return;
    // Open the tab synchronously to avoid popup blockers, then fill it with the generated PDF.
    const pdfTab = openInTab ? window.open("about:blank", "_blank") : null;
    setExportingPdf(true);
    const wasReportMode = reportMode;
    try {
      setReportMode(true);
      await new Promise(resolve => window.setTimeout(resolve, 300));
      const snapshot = await html2canvas(target, {
        backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
        width: target.scrollWidth, height: target.scrollHeight,
        windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
        onclone: cloned => { cloned.body.classList.add("datacanvas-report-mode"); }
      });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      const pageWidth = 277; // A4 landscape width less 10 mm margins
      const pageHeight = 190; // A4 landscape height less 10 mm margins
      const sourceSliceHeight = Math.max(1, Math.floor(snapshot.width * pageHeight / pageWidth));
      let offsetY = 0;
      let page = 0;
      while (offsetY < snapshot.height) {
        const sliceHeight = Math.min(sourceSliceHeight, snapshot.height - offsetY);
        const slice = document.createElement("canvas");
        slice.width = snapshot.width;
        slice.height = sliceHeight;
        const context = slice.getContext("2d");
        if (!context) throw new Error("Could not prepare the PDF page image.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, slice.width, slice.height);
        context.drawImage(snapshot, 0, offsetY, snapshot.width, sliceHeight, 0, 0, snapshot.width, sliceHeight);
        if (page > 0) pdf.addPage("a4", "landscape");
        const renderedHeight = pageWidth * sliceHeight / slice.width;
        pdf.addImage(slice.toDataURL("image/jpeg", 0.94), "JPEG", 10, 10, pageWidth, Math.min(pageHeight, renderedHeight), undefined, "FAST");
        offsetY += sliceHeight;
        page += 1;
      }
      const safeName = String(data?.dashboard?.name || "DataCanvas-dashboard").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "datacanvas-dashboard";
      const pageName = String(activePage?.name || "report").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
      const fileName = `${safeName}-${pageName}.pdf`;
      if (openInTab && pdfTab) {
        const blobUrl = URL.createObjectURL(pdf.output("blob"));
        pdfTab.location.href = blobUrl;
        flash("PDF report opened in a new tab. Use the PDF viewer to save or print it.");
      } else {
        if (openInTab && !pdfTab) flash("Your browser blocked the new tab, so the PDF was downloaded instead.");
        else flash("Professional PDF report downloaded.");
        pdf.save(fileName);
      }
      setShowExportOptions(false);
    } catch (error) {
      if (pdfTab && !pdfTab.closed) pdfTab.close();
      flash("PDF export failed. Please try again or use Save as Image.");
    } finally {
      setReportMode(wasReportMode);
      setExportingPdf(false);
    }
  }
  async function exportPng() {
    const target = canvasRef.current;
    if (!target || exportingImage) return;
    setExportingImage(true);
    const wasReportMode = reportMode;
    try {
      setReportMode(true);
      // Allow report-only styling to apply before capture.
      await new Promise(resolve => window.setTimeout(resolve, 220));
      const image = await html2canvas(target, {
        backgroundColor: dashboardTheme === "dark" ? "#101827" : "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        width: target.scrollWidth,
        height: target.scrollHeight,
        windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth)
      });
      const link = document.createElement("a");
      const safeName = String(data?.dashboard?.name || "DataCanvas-dashboard").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "datacanvas-dashboard";
      link.download = `${safeName}-${String(activePage?.name || "report").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.png`;
      link.href = image.toDataURL("image/png");
      link.click();
      flash("High-resolution dashboard image exported");
    } catch (error) {
      flash("Image export failed. Try Export PDF or check the browser console.");
    } finally {
      setReportMode(wasReportMode);
      setExportingImage(false);
    }
  }
  async function loadVersions() { const r = await api.get(`/versions/${id}`); setVersions(r.data); setShowHistory(true); }
  async function restore(v: any) { if (!confirm(`Restore version ${v.version}?`)) return; await api.post(`/versions/${id}/restore/${v._id}`); await load(); setShowHistory(false); flash(`Restored version ${v.version}`); }
  async function share() { const r = await api.post("/shares", { dashboardId: id }); const url = `${window.location.origin}/shared/${r.data.token}`; await navigator.clipboard?.writeText(url); setShares(s => [r.data, ...s]); setShowShare(true); flash("Share link copied"); }
  async function loadShares() { const r = await api.get(`/shares/dashboard/${id}`); setShares(r.data); setShowShare(true); }
  async function revoke(s: any) { await api.delete(`/shares/${s._id}`); setShares(items => items.map(x => x._id === s._id ? { ...x, active: false } : x)); }
  async function updateDashboard(patch: any) { const r = await api.put(`/dashboards/${id}`, patch); setData((x: any) => ({ ...x, dashboard: r.data })); }
  async function addPage() { const n = pages.length + 1; const p = { id: `page-${Date.now()}`, name: `Page ${n}` }; await updateDashboard({ pages: [...pages, p] }); setSelectedPage(p.id); }
  async function deletePage() { if (pages.length === 1) return; const remain = pages.filter((p: any) => p.id !== selectedPage); await updateDashboard({ pages: remain }); setSelectedPage(remain[0].id); }
  function drop(e: any, targetId: string) { e.preventDefault(); const source = e.dataTransfer.getData("text/plain"); if (!source || source === targetId) return; const arr = [...visuals]; const a = arr.findIndex(x => x._id === source), b = arr.findIndex(x => x._id === targetId); if (a < 0 || b < 0) return; const [item] = arr.splice(a, 1); arr.splice(b, 0, item); setVisuals(arr); arr.forEach((x, i) => updateVisual(x, { position: { ...(x.position || {}), order: i } })); }

  const activePage = pages.find((p: any) => p.id === selectedPage);
  const dashboardTheme = data?.dashboard?.theme || "light";

  return <Layout>
    <div className={`studio-shell ${reportMode ? "report-mode" : ""}`}>
      <div className="studio-topline">
        <button className="back" onClick={() => nav(-1)}><ArrowLeft size={16}/> Project</button>
        <div className="studio-breadcrumb"><LayoutDashboard size={15}/> Dashboard Studio <span>/</span> {data?.dashboard?.name || "Untitled dashboard"}</div>
      </div>

      <header className="studio-header">
        <div>
          <div className="eyebrow">ANALYTICS WORKSPACE</div>
          <h1>{data?.dashboard?.name || "Dashboard"}</h1>
          <p>Design a professional interactive report from your uploaded data.</p>
        </div>
        <div className="studio-actions">
          <button className="secondary" onClick={autoBuild} disabled={building}><Wand2 size={16}/> {building ? "Generating 3 designs…" : pages.some((p: any) => String(p.id).startsWith("design-")) ? "Rebuild 3 designs" : "Auto-build 3 designs"}</button>
          <button className="secondary" onClick={saveVersion}><Save size={16}/> Save dashboard</button>
          <button className="secondary" onClick={loadShares}><Link2 size={16}/> Share</button>
          <button className="primary export-action" onClick={() => setShowExportOptions(true)} title="Open export options for PDF and image reports"><Download size={16}/> Export report</button>
        </div>
      </header>

      <div className="studio-toolbar">
        <div className="page-tabs"><span className="toolbar-label">PAGES</span>{pages.map((p: any) => <button className={p.id === selectedPage ? "page-tab active" : "page-tab"} key={p.id} onClick={() => setSelectedPage(p.id)}>{p.name}</button>)}<button className="icon-btn" onClick={addPage} title="Add page"><Plus size={15}/></button>{pages.length > 1 && <button className="icon-btn danger" onClick={deletePage}><Trash2 size={14}/></button>}</div>
        <div className="toolbar-right"><div className="layout-style-picker" role="group" aria-label="Dashboard layout style"><button className={layoutStyle === "powerbi" ? "style-choice active" : "style-choice"} onClick={() => chooseLayoutStyle("powerbi")} title="Power BI-inspired grid">Analytics</button><button className={layoutStyle === "executive" ? "style-choice active" : "style-choice"} onClick={() => chooseLayoutStyle("executive")} title="Executive report layout">Executive</button><button className={layoutStyle === "midnight" ? "style-choice active" : "style-choice"} onClick={() => chooseLayoutStyle("midnight")} title="Dark studio layout">Midnight</button></div><button className="secondary" onClick={() => updateDashboard({ theme: dashboardTheme === "dark" ? "light" : "dark" })}><Palette size={15}/> {dashboardTheme === "dark" ? "Dark" : "Light"}</button><button className="secondary" onClick={loadVersions}><History size={15}/> Versions</button></div>
      </div>

      <section className="filter-bar studio-filters"><div className="filter-title"><Filter size={15}/> Report filters</div>{filterFields.map((c: any) => <label key={c.name}><span>{c.name}</span><select value={filters[c.name] || ""} onChange={e => { const next = { ...filters, [c.name]: e.target.value }; setFilters(next); updateDashboard({ filters: next }); }}><option value="">All</option>{Array.from(new Set((c.name.includes(".") ? relatedSample : (ds?.sample || [])).map((r: any) => String(r[c.name] ?? "")).filter(Boolean))).slice(0, 20).map((v: any) => <option key={v}>{v}</option>)}</select></label>)}<button className="secondary" onClick={() => { setFilters({}); updateDashboard({ filters: {} }); }}><RefreshCw size={14}/> Reset</button></section>

      <div className="studio-workspace">
        <aside className="studio-sidebar">
          <div className="studio-sidebar-tabs"><button className={activeTab === "build" ? "active" : ""} onClick={() => setActiveTab("build")}><Layers size={15}/> Build</button><button className={activeTab === "style" ? "active" : ""} onClick={() => setActiveTab("style")}><Settings2 size={15}/> Format</button></div>
          {activeTab === "build" ? <>
            <div className="builder-section"><div className="builder-section-title">DATA SOURCE</div><select value={form.datasetId} onChange={e => setForm({ ...form, datasetId: e.target.value, xField: "", yField: "", measureId: "" })}>{datasets.map(d => <option value={d._id} key={d._id}>{d.originalName}</option>)}</select><button className="data-link" onClick={() => form.datasetId && nav(`/datasets/${form.datasetId}`)} disabled={!form.datasetId}><Table2 size={14}/> Explore data</button></div>
            <div className="builder-section"><div className="builder-section-title">VISUAL TYPE</div><div className="visual-type-grid">{chartTypes.map(t => <button key={t} className={form.type === t ? "selected" : ""} onClick={() => setForm({ ...form, type: t })}>{chartIcon(t)}<span>{t === "kpi" ? "KPI" : t[0].toUpperCase() + t.slice(1)}</span></button>)}</div></div>
            <div className="builder-section"><div className="builder-section-title">FIELDS</div>{form.type !== "kpi" && <label>Category / X<select value={form.xField} onChange={e => setForm({ ...form, xField: e.target.value })}><option value="">Select field</option>{categorical.map((c: any) => <option key={c.name}>{c.name}</option>)}{numeric.map((c: any) => <option key={c.name}>{c.name}</option>)}</select></label>}<label>Saved measure<select value={form.measureId || ""} onChange={e => setForm({ ...form, measureId: e.target.value, yField: e.target.value ? "" : form.yField })}><option value="">Use a numeric field</option>{activeMeasures.map((m: any) => <option key={m.id} value={m.id}>{m.name} ({m.format || "number"})</option>)}</select></label>{!form.measureId && <label>Value / Y<select value={form.yField} onChange={e => setForm({ ...form, yField: e.target.value })}><option value="">Select numeric field</option>{numeric.map((c: any) => <option key={c.name}>{c.name}</option>)}</select></label>}<label>Aggregation<select value={form.aggregation} onChange={e => setForm({ ...form, aggregation: e.target.value })}>{["sum", "avg", "count", "min", "max"].map(x => <option key={x}>{x}</option>)}</select></label></div>
            <div className="builder-section"><div className="builder-section-title">TITLE</div><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/><div className="color-row"><span>Accent</span>{palette.slice(0, 6).map(c => <button key={c} className={form.color === c ? "color-dot active" : "color-dot"} style={{ background: c }} onClick={() => setForm({ ...form, color: c })}/>)}</div><button className="primary wide" onClick={add}><Plus size={16}/> Add visual</button></div>
            <div className="builder-section auto-card"><Wand2 size={18}/><strong>Start faster</strong><p>Generate KPIs, comparisons, trends and distributions automatically from the dataset.</p><button className="secondary wide" onClick={autoBuild} disabled={building}>{building ? "Generating 3 designs…" : pages.some((p: any) => String(p.id).startsWith("design-")) ? "Rebuild all 3 designs" : "Build all 3 designs"}</button></div>
          </> : <>
            <div className="builder-section"><div className="builder-section-title">SELECTED VISUAL</div>{selected ? <><input value={selected.title} onChange={e => updateVisual(selected, { title: e.target.value })}/><div className="format-row"><span>Width</span><button className="icon-btn" onClick={() => updateVisual(selected, { position: { ...(selected.position || {}), width: Math.max(3, (selected.position?.width || 6) - 1) } })}><ZoomOut size={14}/></button><span>{selected.position?.width || 6}/12</span><button className="icon-btn" onClick={() => updateVisual(selected, { position: { ...(selected.position || {}), width: Math.min(12, (selected.position?.width || 6) + 1) } })}><ZoomIn size={14}/></button></div><div className="color-row">{palette.map(c => <button key={c} className={selected.style?.color === c ? "color-dot active" : "color-dot"} style={{ background: c }} onClick={() => updateVisual(selected, { style: { ...(selected.style || {}), color: c } })}/>)}</div><button className="danger-outline wide" onClick={() => remove(selected)}><Trash2 size={14}/> Delete visual</button></> : <p className="muted">Click a visual on the canvas to format it.</p>}</div>
          </>}
        </aside>

        <main ref={canvasRef} className={`studio-canvas ${dashboardTheme} skin-${layoutStyle} ${selectedPage === "design-executive" ? "design-executive" : selectedPage === "design-exploration" ? "design-exploration" : selectedPage === "design-insights" ? "design-insights" : ""}`}>
          <div className="report-meta"><div className="report-brand">DATACANVAS <span>BUSINESS INTELLIGENCE REPORT</span></div><h1>{data?.dashboard?.name || "Analytics Dashboard"}</h1><p>{activePage?.name || "Overview"} · Generated {new Date().toLocaleString()} · Source: {ds?.originalName || "Uploaded dataset"}</p><div className="report-filter-summary">{Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(" · ") || "Filters: All available records"}</div></div>
          <div className="canvas-header"><div><div className="canvas-page-title"><span className="live-dot"/> {activePage?.name}</div><div className="canvas-subtitle">{pageVisuals.length} visual{pageVisuals.length === 1 ? "" : "s"} · {datasets.length} dataset{datasets.length === 1 ? "" : "s"}</div></div></div>
          {generationQualityWarnings.length > 0 && <section style={{ margin: "0 0 16px", padding: "12px 14px", border: "1px solid #f0c36d", borderRadius: 12, background: "rgba(245,158,11,.08)", color: "var(--text,#172033)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 6 }}><AlertTriangle size={16}/> Automatic data-quality review · {generationQualityWarnings.length} warning{generationQualityWarnings.length === 1 ? "" : "s"}</div>
            <ul style={{ margin: 0, paddingLeft: 22 }}>{generationQualityWarnings.slice(0, 6).map((warning: any, index: number) => <li key={`${warning.code || "warning"}-${index}`} style={{ marginTop: 4, fontSize: 12 }}>{typeof warning === "string" ? warning : warning.message || "Review this field before interpreting the dashboard."}</li>)}</ul>
            {generationQualityWarnings.length > 6 && <small>Showing 6 of {generationQualityWarnings.length} unique warnings.</small>}
          </section>}
          {insightData && <section className={`intelligence-panel intelligence-${selectedPage === "design-exploration" ? "exploration" : selectedPage === "design-insights" ? "insights" : "executive"}`}>
            <div className="intelligence-heading"><div><span className="intelligence-kicker">DATA INTELLIGENCE · SOURCE-VERIFIED</span><h2>{selectedPage === "design-exploration" ? "Explore the evidence" : selectedPage === "design-insights" ? "Findings that deserve attention" : "Dataset at a glance"}</h2><p>{insightData.source?.selectedSheet ? `Worksheet analyzed: ${insightData.source.selectedSheet}` : "Analysis calculated from the uploaded source file"} · {Number(insightData.coverage?.rowsRead || 0).toLocaleString()} rows</p></div><span className="intelligence-source-badge"><span className="source-status-dot"/> Source-calculated</span></div>
            <div className="intelligence-stats">
              <div><span>Source records</span><strong>{Number(insightData.coverage?.rowsRead || 0).toLocaleString()}</strong><small>Rows read</small></div>
              <div><span>Fields profiled</span><strong>{Number(insightData.coverage?.columnsProfiled || 0).toLocaleString()}</strong><small>{Number(insightData.coverage?.numericFields || 0)} numeric · {Number(insightData.coverage?.categoricalFields || 0)} categorical</small></div>
              <div><span>Missing cells</span><strong>{Number(insightData.coverage?.missingCells || 0).toLocaleString()}</strong><small>{Number(insightData.coverage?.columnsWithMissing || 0)} fields affected</small></div>
              <div><span>Duplicate candidates</span><strong>{Number(insightData.coverage?.duplicateRowsFlagged || 0).toLocaleString()}</strong><small>Flagged, not removed</small></div>
            </div>
            {selectedPage === "design-exploration" ? <div className="intelligence-detail-grid"><section><h3>Numeric field profile</h3><div className="intelligence-table-wrap"><table><thead><tr><th>Field</th><th>Valid</th><th>Mean</th><th>Median</th><th>Min–Max</th></tr></thead><tbody>{(insightData.columns || []).filter((c:any)=>c.type==="numeric").slice(0,8).map((c:any)=><tr key={c.name}><td>{c.name}</td><td>{Number(c.validNumeric||0).toLocaleString()}</td><td>{Number(c.mean||0).toLocaleString(undefined,{maximumFractionDigits:2})}</td><td>{Number(c.median||0).toLocaleString(undefined,{maximumFractionDigits:2})}</td><td>{Number(c.min||0).toLocaleString(undefined,{maximumFractionDigits:2})} – {Number(c.max||0).toLocaleString(undefined,{maximumFractionDigits:2})}</td></tr>)}</tbody></table></div></section><section><h3>Correlation signals</h3>{(insightData.correlations||[]).filter((c:any)=>Math.abs(c.r)>=0.4).slice(0,5).map((c:any)=><div className="intelligence-finding" key={`${c.x}-${c.y}`}><strong>{c.x} ↔ {c.y}</strong><p>r = {c.r} · {c.strength} association · n = {c.n}</p><small>Association is not proof of causation.</small></div>)}{!(insightData.correlations||[]).some((c:any)=>Math.abs(c.r)>=0.4)&&<p className="intelligence-empty">No moderate-or-strong numeric associations were detected from available paired records.</p>}</section></div> : selectedPage === "design-insights" ? <div className="intelligence-finding-grid">{(insightData.findings||[]).slice(0,6).map((f:any,i:number)=><article className={`intelligence-finding priority-${f.priority||"info"}`} key={`${f.title}-${i}`}><span>{String(f.type||"observation").replace(/_/g," ")}</span><h3>{f.title}</h3><p>{f.evidence}</p><small>{f.recommendation}</small></article>)}{!(insightData.findings||[]).length&&<p className="intelligence-empty">No additional findings could be calculated from the available data. Review coverage and column types.</p>}</div> : <div className="intelligence-detail-grid"><section><h3>Priority data-quality checks</h3>{(insightData.qualityIssues||[]).slice(0,4).map((q:any,i:number)=><div className={`intelligence-finding priority-${q.severity||"low"}`} key={`${q.title}-${i}`}><strong>{q.title}</strong><p>{q.evidence}</p></div>)}{!(insightData.qualityIssues||[]).length&&<p className="intelligence-empty">No missing-value or duplicate candidates were detected by these checks.</p>}</section><section><h3>Coverage and limitations</h3><div className="coverage-line"><span>Columns considered</span><strong>{insightData.coverage?.columnsProfiled || 0}/{insightData.coverage?.columnsDetected || 0}</strong></div><div className="coverage-line"><span>Worksheets in workbook</span><strong>{insightData.coverage?.sheetsDetected || 0}</strong></div>{(insightData.coverage?.sheetsNotAnalyzed||[]).length>0&&<p className="coverage-warning">Not analyzed: {insightData.coverage.sheetsNotAnalyzed.join(", ")}. These sheets were not merged automatically.</p>}{(insightData.coverage?.columnsNotAnalyzed||[]).slice(0,3).map((c:any)=><p className="coverage-note" key={c.name}><strong>{c.name}:</strong> {c.reason}</p>)}<p className="coverage-note">{(insightData.methodology||[])[0]}</p></section></div>}
            {insightError && <p className="coverage-warning">{insightError}</p>}
          </section>}
          <div className={`canvas-grid power-grid layout-${layoutStyle}`}>
            {pageVisuals.map(v => {
              const visualDataset = datasets.find((item: any) => item._id === v.datasetId);
              const width = Math.min(12, Math.max(3, Number(v.position?.width || (v.type === "kpi" ? 3 : 6))));
              const height = Number(v.position?.height || (v.type === "kpi" ? 1 : 2));
              return <article key={v._id} className={`visual-card power-card ${selectedVisual === v._id ? "selected" : ""}`} draggable onClick={() => setSelectedVisual(v._id)} onDragStart={e => e.dataTransfer.setData("text/plain", v._id)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, v._id)} style={{ gridColumn: `span ${width}`, minHeight: height === 1 ? 165 : 340 }}>
                <div className="visual-head"><div className="visual-title"><GripVertical size={15}/><span className="visual-type-icon">{chartIcon(v.type)}</span><strong>{v.title}</strong></div><div className="visual-actions"><button className="icon-btn" title="Wider" onClick={e => { e.stopPropagation(); updateVisual(v, { position: { ...(v.position || {}), width: Math.min(12, width + 1) } }); }}><ZoomIn size={13}/></button><button className="icon-btn" title="Narrower" onClick={e => { e.stopPropagation(); updateVisual(v, { position: { ...(v.position || {}), width: Math.max(3, width - 1) } }); }}><ZoomOut size={13}/></button><button className="icon-btn" title="Duplicate" onClick={e => { e.stopPropagation(); duplicate(v); }}><Copy size={13}/></button><button className="icon-btn danger" title="Delete" onClick={e => { e.stopPropagation(); remove(v); }}><Trash2 size={13}/></button></div></div>
                <div className={v.type === "kpi" ? "chart-area chart-area-kpi" : "chart-area"} title={`${v.title}. ${v.xField ? `Grouped by ${v.xField}. ` : ""}Measure: ${v.measureId ? ((visualDataset?.calculatedMeasures || []).find((m:any)=>m.id===v.measureId)?.name || "Saved measure") : v.yField}. Aggregation: ${v.aggregation || "sum"}.`}>{v.type === "kpi" && <div className="kpi-caption">{v.measureId ? ((visualDataset?.calculatedMeasures || []).find((m:any)=>m.id===v.measureId)?.name || "Saved measure") : `${v.aggregation} · ${v.yField}`}</div>}<Chart v={v} data={chartData[v._id] || []}/></div>
                <div className="visual-meta"><span>{v.xField ? `Group: ${v.xField}` : "Single metric"}</span><span>{v.measureId ? ((visualDataset?.calculatedMeasures || []).find((m:any)=>m.id===v.measureId)?.formula || "Saved measure") : `${v.aggregation || "sum"}(${v.yField || "records"})`}</span><span>Lineage: {countUniqueLineage(chartData[v._id] || []).toLocaleString()} unique source rows</span><span>Source worksheet: {visualDataset?.selectedSheet || "Active worksheet"}</span><span>Purpose: {String(v.style?.intent || "custom analysis").replace(/_/g, " ")}</span></div>
              </article>;
            })}
            {!pageVisuals.length && <div className="canvas-empty"><div className="empty-icon"><Wand2 size={28}/></div><h2>Your report canvas is empty</h2><p>Upload data and click <strong>Auto-build report</strong> to generate a multi-visual analytics layout.</p><button className="primary" onClick={autoBuild}><Wand2 size={16}/> Auto-build report</button></div>}
          </div>
        </main>
      </div>
    </div>

    {showExportOptions && <div className="export-overlay" role="dialog" aria-modal="true" aria-labelledby="export-report-title" onMouseDown={e => { if (e.target === e.currentTarget && !exportingPdf && !exportingImage) setShowExportOptions(false); }}><section className="export-dialog"><div className="export-dialog-head"><div><span className="export-kicker">DATACANVAS REPORTING</span><h2 id="export-report-title">Save your dashboard</h2><p>Export the current dashboard page with its actual charts, data findings, and active filters.</p></div><button className="icon-btn" onClick={() => setShowExportOptions(false)} disabled={exportingPdf || exportingImage} aria-label="Close export options"><X size={18}/></button></div><div className="export-choice-list"><button className="export-choice" onClick={() => void exportPdf(true)} disabled={exportingPdf || exportingImage}><span className="export-choice-icon pdf-icon"><Printer size={22}/></span><span><strong>Open as PDF</strong><small>Open a paginated, print-ready PDF in a new browser tab.</small></span><span className="export-choice-arrow">↗</span></button><button className="export-choice" onClick={() => void exportPdf(false)} disabled={exportingPdf || exportingImage}><span className="export-choice-icon pdf-icon"><Download size={22}/></span><span><strong>{exportingPdf ? "Preparing PDF…" : "Download PDF"}</strong><small>Save a professional A4 landscape report directly to your computer.</small></span><span className="export-choice-arrow">↓</span></button><button className="export-choice" onClick={() => void exportPng()} disabled={exportingPdf || exportingImage}><span className="export-choice-icon image-icon"><Layers size={22}/></span><span><strong>{exportingImage ? "Saving image…" : "Save as Image (PNG)"}</strong><small>Download a high-resolution image of the current dashboard.</small></span><span className="export-choice-arrow">↓</span></button></div><p className="export-dialog-footnote">Only the selected dashboard page is exported. Choose another page and export it separately.</p></section></div>}
    {status && <div className="toast">{status}</div>}
    {showHistory && <div className="drawer"><div className="drawer-head"><h3>Version history</h3><button className="icon-btn" onClick={() => setShowHistory(false)}><X size={17}/></button></div>{versions.length === 0 ? <button className="secondary wide" onClick={loadVersions}>Load history</button> : versions.slice(0, 10).map(v => <div className="history-row" key={v._id}><div><strong>Version {v.version}</strong><small>{new Date(v.createdAt).toLocaleString()}</small></div><button className="secondary" onClick={() => restore(v)}><RotateCcw size={14}/> Restore</button></div>)}</div>}
    {showShare && <div className="drawer share-drawer"><div className="drawer-head"><h3>Share links</h3><button className="icon-btn" onClick={() => setShowShare(false)}><X size={17}/></button></div><button className="primary wide" onClick={share}><Share2 size={15}/> Create view-only link</button>{shares.map(s => <div className="history-row" key={s._id}><div><strong>{s.active ? "Active" : "Revoked"}</strong><small className="share-url">{window.location.origin}/shared/{s.token}</small></div>{s.active && <button className="secondary" onClick={() => revoke(s)}>Revoke</button>}</div>)}</div>}
  </Layout>;
}
