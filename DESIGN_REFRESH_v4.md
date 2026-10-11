# DataCanvas Studio — Design Refresh v4

This release updates the actual React/CSS application, not just presentation images.

## Three dashboard presentation styles

- **Analytics** — Power BI-inspired 12-column canvas, compact KPI cards, flexible chart widths, neutral light workspace.
- **Executive** — warm paper-like canvas, serif section heading, restrained teal accents and clean report-style cards.
- **Midnight** — dark navy canvas, high-contrast cards and blue highlight values.

Use the style selector in the dashboard toolbar. The selected presentation style is saved in this browser per dashboard. It changes the real rendered dashboard UI and does not require an AI API.

## UI and chart fixes

- Added missing Studio workspace styles for the dashboard header, toolbar, page tabs, report filters, builder sidebar, visual type picker, cards, chart containers, empty state, version/share drawers and responsive breakpoints.
- Changed the dashboard grid to a 12-column CSS grid. KPI visuals can occupy 3 columns, half-width visuals 6 columns and wide visuals 12 columns.
- Fixed the narrow-card action controls so they stay compact instead of stacking into tall vertical button columns.
- Reduced KPI chart height so a metric card displays as a compact KPI rather than a giant empty panel.
- Added mobile/tablet reflow and print-specific layout rules.
- Hidden empty placeholder column names such as `_EMPTY`, `_EMPTY_1` and `Unnamed: 0` from builder fields and report filters.
- Formatted long date labels more compactly on chart axes.
- Corrected line/area chart aggregation to sort date-like categories chronologically rather than by descending measure value.
- Applied the chart `topN` and overflow settings in server-side aggregation, including an `Others` bucket for truncation-enabled breakdowns.

## Runtime verification

This archive was statically reviewed and the ZIP structure is validated. Dependency installation timed out in the build environment, so a complete TypeScript production build and live browser test could not be honestly certified here. After extracting it, run the normal install commands in `README.md`; if your local compiler reports an error, share the first error block and we can resolve it precisely.
