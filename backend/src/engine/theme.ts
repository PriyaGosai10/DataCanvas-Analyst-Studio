import { DesignTokens } from "./types";
const presets = [
  { primary: "#2563eb", accent: "#0f766e" },
  { primary: "#6d28d9", accent: "#0891b2" },
  { primary: "#0f766e", accent: "#d97706" },
  { primary: "#be123c", accent: "#4f46e5" },
  { primary: "#334155", accent: "#0d9488" },
  { primary: "#9333ea", accent: "#ea580c" },
  { primary: "#0369a1", accent: "#65a30d" }
];
export function createDesignTokens(theme: "light" | "dark" = "light", primaryColor?: string, fontFamily = "Inter, ui-sans-serif, system-ui, sans-serif", variant = 0): DesignTokens {
  const dark = theme === "dark";
  const preset = presets[Math.abs(variant) % presets.length];
  const primary = primaryColor || preset.primary;
  return { id: `theme_${theme}_${primary.replace("#", "")}`, name: `${dark ? "Dark Analytics" : "Executive Clarity"} ${Math.abs(variant) % presets.length + 1}`, mode: theme, palette: { primary, secondary: dark ? "#94a3b8" : "#64748b", accent: preset.accent, background: dark ? "#0b1220" : "#f4f7fb", surface: dark ? "#111c2e" : "#ffffff", text: dark ? "#e5edf8" : "#172033", muted: dark ? "#94a3b8" : "#667085", positive: "#16a34a", negative: "#dc2626" }, fontFamily, radius: 12, spacing: 16, contrastChecked: true };
}
