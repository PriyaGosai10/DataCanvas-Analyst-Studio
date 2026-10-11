# v13 — Saved report export UX

This release preserves the existing DataCanvas dashboard/editor and focuses on the requested saved-report workflow.

## Changes
- Replaced the ambiguous “Open report” action with two explicit export actions: **Save as PDF** and **Save as Image**.
- Renamed the dashboard version action to **Save dashboard** to distinguish saving the editable configuration/version from exporting a report file.
- Removed the canvas-header refresh and preview icons so the report canvas header is clean.
- Added automatic return to the editor after the browser print dialog closes.
- Kept high-resolution PNG capture using the existing html2canvas dependency.
- Documented that PDF uses the browser's print dialog; choose “Save as PDF” in the destination menu.

## Validation
- Confirmed the export controls and handlers are present in the source.
- ZIP archive integrity is checked after packaging.
- Full frontend build/runtime was not run in this environment; run `npm install` and `npm run build` locally to verify against your installed dependencies.
