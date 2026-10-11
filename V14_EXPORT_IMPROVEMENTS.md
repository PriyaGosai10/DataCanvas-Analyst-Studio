# DataCanvas v14 — Professional Report Export

## What changed
- Replaced separate PDF and image buttons with one **Export report** action.
- Added a focused export dialog with **Open as PDF**, **Download PDF**, and **Save as Image (PNG)**.
- PDF output is generated as a real downloadable/openable PDF rather than relying on the browser print dialog.
- PDF output uses A4 landscape pages and slices tall dashboards across multiple pages.
- Exported report pages include report title, source file, generation time, and current filter summary.
- Replaced the manual “Refresh analysis” control with a non-interactive “Source-calculated” status label.
- Added styles for the export dialog and report-mode metadata.

## Dependency
`jspdf` is added to `frontend/package.json`. Run `npm install` in `frontend` after extracting.

## Scope and verification
Exports target the currently selected dashboard page; export other pages individually. ZIP structure and source edits were checked. A complete dependency-installed browser runtime test was not possible in this environment.
