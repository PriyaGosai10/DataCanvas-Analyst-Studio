import { GridItem, GridLayoutJSON, VisualManifestItem } from "./types";
function dimensions(v: VisualManifestItem): { w: number; h: number; minW: number; minH: number; aspectRatio?: number } {
  if (v.type === "kpi") return { w: 3, h: 2, minW: 3, minH: 2, aspectRatio: 1.8 };
  if (v.type === "line" || v.type === "area") return { w: 12, h: 4, minW: 6, minH: 3 };
  if (v.type === "bar") return { w: 6, h: 4, minW: 4, minH: 3 };
  if (v.type === "scatter") return { w: 6, h: 4, minW: 4, minH: 3 };
  if (v.type === "donut" || v.type === "pie") return { w: 4, h: 3, minW: 3, minH: 3, aspectRatio: 1.25 };
  return { w: 12, h: 6, minW: 8, minH: 4 };
}
function pack(visuals: VisualManifestItem[], columns: number, tablet: boolean, mobile: boolean): GridItem[] {
  let x = 0, y = 0, rowHeight = 0;
  const out: GridItem[] = [];
  for (const v of visuals) {
    const d = dimensions(v);
    let w = mobile ? columns : tablet && d.w === 3 ? 6 : Math.min(columns, d.w);
    if (w > columns) w = columns;
    if (x + w > columns) { x = 0; y += rowHeight; rowHeight = 0; }
    const h = mobile ? Math.max(d.h, v.type === "kpi" ? 2 : 4) : d.h;
    out.push({ id: v.id, x, y, w, h, minW: mobile ? columns : Math.min(d.minW, w), minH: d.minH, aspectRatio: d.aspectRatio, overflow: v.overflow });
    x += w;
    rowHeight = Math.max(rowHeight, h);
    if (x >= columns) { x = 0; y += rowHeight; rowHeight = 0; }
  }
  return out;
}
export function createGridLayout(visuals: VisualManifestItem[]): GridLayoutJSON {
  return { columns: 12, gap: 16, breakpoints: { lg: 1200, md: 768, sm: 0 }, lg: pack(visuals, 12, false, false), md: pack(visuals, 12, true, false), sm: pack(visuals, 12, false, true) };
}
