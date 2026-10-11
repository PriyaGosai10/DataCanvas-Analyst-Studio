# DataCanvas Analyst Studio v14 — Semantic Model, Lineage & Reliability Repair

## Additional adaptive-dashboard and data-cleaning pass (2026-10-11)

This pass specifically targets the goal of uploading different spreadsheets and getting a useful dashboard from each file rather than assuming every workbook is a standard sales table.

- **International numeric normalization:** the shared numeric parser now handles common US/European separators, Indian grouping (for example `₹ 1,23,456.78`), currency symbols/codes, percentages, and accounting negatives such as `(1,200.00)`. Analytics aggregation and approved numeric conversion now use the same parser so values are interpreted consistently.
- **Automatic data-quality warnings:** cleaning now flags mixed numeric/non-numeric columns and fields with substantial missingness, in addition to existing null-token and repeated-header checks. Warnings are shown in the generated dashboard so users can review them before trusting totals.
- **Adaptive field ranking:** visual generation ranks fields using semantic roles and confidence rather than simply using the first numeric/category field. Dates are prioritized for trend charts, meaningful dimensions for breakdowns, and numeric fields are not selected as categories merely because they are numeric.
- **Category-only fallback:** files with useful categorical fields but no safe numeric measure can still generate a record-count breakdown instead of failing dashboard generation.
- **Small integer counts:** a narrow range such as campaign conversions is no longer automatically misclassified as a rating dimension unless the header supports that interpretation.
- **KPI safety:** auto-generated KPI visuals no longer all inherit the first saved user measure; a saved measure is attached only when the visual's metric ID matches it.

### Verification for this additional pass

- **PASS:** 62 TypeScript/TSX files passed syntax transpilation with zero diagnostics.
- **PASS:** strict isolated typechecking for the shared numeric sanitizer, profiler, chart-selection engine, date topology, and preparation service.
- **PASS:** isolated numeric/data-quality smoke tests for currency formats, European separators, Indian grouping, accounting negatives, percentages, mixed values and missingness.
- **PASS:** adaptive dashboard smoke tests on synthetic sales, marketing, and category-only datasets. The sales sample selected a date trend and region comparison; the marketing sample selected a date trend and campaign comparison; category-only data produced a count-by-department chart.
- **BLOCKED:** the full `npm install` attempt timed out, so the complete engine test suite, real XLSX parser integration, frontend/backend builds, and live MongoDB/browser/export flows could not be rerun for this pass. New regression tests are included in the test source but are not represented as passed until run in a complete dependency environment.

## Scope and status

This repair continues the existing React + TypeScript frontend, Express + TypeScript backend, MongoDB/Mongoose persistence, authentication, dashboard editor, versioning, sharing, data preparation and export code. It does not replace the application with a separate demo.

**Implemented and covered by isolated automated tests:** reverse-direction and multi-hop relationship traversal, cycle/parallel-edge rejection, per-sheet calculated columns, safe aggregate measures, formula dependency checks, unique source-row lineage, related-field filtering controls, consistent semantic-model use in aggregation/export/dashboard generation/insights, production configuration checks, and Express 4 async error forwarding.

**Not certified production-ready:** full dependency installation, real application builds, live MongoDB/API/browser integration, and actual XLSX package parsing could not be verified in this environment. Do not treat source transpilation as a substitute for a full build.

## Fixes in this pass

### 1. Worksheet joins and relationship correctness

- Relationship traversal can start from either endpoint and continue across connected worksheets.
- Joins preserve the selected/root worksheet for left-join traversal, including when traversing a relationship in reverse.
- Joined worksheet fields are sheet-qualified (`Worksheet.Column`) so similarly named fields are not silently overwritten.
- Unmatched left-join rows expose related fields as null, preserving a stable joined schema.
- Active parallel relationships between the same worksheet pair and ambiguous relationship cycles are rejected rather than silently skipped.
- Relationship cardinality declarations are validated against actual key uniqueness when the semantic model is saved.
- Many-to-many relationships remain allowed when explicitly declared; they can multiply records, so users must validate measure totals against the source workbook.

### 2. Calculated columns and measures

- Calculated columns are evaluated in dependency order, so a column can reference an earlier-defined calculated column even if the saved list order differs.
- Calculated columns are applied separately to each worksheet before joins, so related-sheet calculations are present in the joined analytical view.
- Cross-worksheet calculated-column formulas are rejected with a clear message; use a calculated measure for formulas spanning related worksheets.
- Measures can reference qualified fields such as `SUM([Campaigns.Clicks])` and are checked against fields available through the active relationship graph.
- Measures must use supported aggregate functions (`SUM`, `AVG`/`AVERAGE`, `COUNT`, `MIN`, `MAX`) and unavailable field references fail clearly instead of silently returning a blank result.
- Parenthesized accounting values such as `(1,200)` are parsed as negative numbers.
- Saved measures flow through chart aggregation, KPI calculations, public shared dashboards and insights. Insights include calculated measure values for the current filtered semantic view.

### 3. Lineage and related-field filtering

- Aggregate marks and KPIs include unique worksheet/row-number references for contributing source rows.
- Dashboard lineage summaries count unique worksheet-row pairs across chart marks rather than adding repeated per-mark counts.
- The dashboard builder discovers qualified fields from the joined data view for chart fields and report filters.
- Selected-sheet qualification aliases and internal lineage metadata are hidden from the ordinary explorer, generated dashboard field list, and CSV headers to avoid duplicate-looking fields.
- CSV export uses prepared and joined data where relationships are active and does not export internal lineage metadata.

### 4. Reliability and secure configuration

- Added an async route wrapper across Express routes. Rejected async controller promises are forwarded to Express error middleware instead of becoming unhandled promise rejections under Express 4.
- Production startup now rejects a missing/weak/default JWT secret, missing explicit `MONGODB_URI`, or a localhost `CLIENT_URL`.
- `backend/.env.example` documents secret generation and leaves `JWT_SECRET` blank so the example placeholder is not accidentally used in production.

### 5. Save/reload, versioning and exports

- Saved measure IDs remain part of visual definitions and flow through the existing persistence/version snapshot mechanisms.
- Public shared dashboard aggregation now resolves the saved measure ID just like the authenticated dashboard editor.
- Existing PDF/PNG rendering code is retained. These exports, dashboard save/reload, version restore, authentication, and sharing have not been exercised end to end in this environment.

## Verification performed

- **PASS:** backend TypeScript source transpilation: 49 files, zero syntax diagnostics.
- **PASS:** frontend TypeScript/TSX source transpilation: 12 files, zero syntax diagnostics.
- **PASS:** 32 engine, preparation, formula, relationship, lineage and semantic-measure tests.
- **PASS:** strict isolated typechecking of semantic-model, data-preparation, spreadsheet-service, analytics-service and insight-service TypeScript modules using a temporary declaration for the missing XLSX dependency.
- **PASS with a test-environment limitation:** multi-hop/reverse-direction join logic and cycle rejection were exercised using an in-memory XLSX adapter. The actual `xlsx` package was unavailable, so its real workbook parser/writer was not verified here.
- **BLOCKED:** dependency installation timed out. Standard `npm test`, full backend build, full frontend build and complete project typechecking have not passed or been verified.
- **NOT TESTED END TO END:** live MongoDB persistence, auth/authorization, real workbook upload and sheet switching through HTTP, dashboard save/reload/version restore, sharing, CSV export via HTTP, and browser PDF/PNG rendering.

## Remaining work before production use

1. Install dependencies and pass the actual backend and frontend builds using the project's package manifests.
2. Run integration tests with MongoDB and real CSV/XLSX workbooks, including missing keys, duplicate keys, every declared cardinality, reverse joins, multi-hop joins, and join-induced row multiplication.
3. Verify saved measures such as CTR and ROAS against known expected totals before and after filters and joins.
4. Test dashboard save/reload, version restoration, sharing, CSV/PDF/PNG exports, and authentication in a browser.
5. Load-test lineage payload sizes on large workbooks; exact row references may make responses large.
6. Add broader support/tests for bridge tables, relationship-filter propagation semantics, formula-cached cells, named ranges and complex workbook layouts.

## Local verification commands

From the extracted project root:

```bash
npm run install:all
npm test
npm run build
```

Configure `backend/.env` from `backend/.env.example`. For production, generate a unique random `JWT_SECRET`, set an explicit `MONGODB_URI`, and set `CLIENT_URL` to the deployed frontend origin. Do not commit credentials. Before relying on the application for business decisions, compare dashboard results against known totals from a real workbook.
