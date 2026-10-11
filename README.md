# DataCanvas — Ready-to-Run Full-Stack Analytics Platform

DataCanvas is a no-code data analytics and dashboard builder built with React, Express, TypeScript, MongoDB and Recharts. This improved release adds a source-backed analyst intelligence layer and explicit analysis coverage. It does **not** require an OpenAI API key or any paid AI service.

## What is included

### Professional report export (v12)

- **Save as PDF** prepares a clean, print-ready report and opens the browser print dialog. Select **Save as PDF** as the destination. The exported report hides editor controls and includes the report title, source file, active page, generation time, and active filter summary.
- **Save as Image** downloads a high-resolution PNG of the current dashboard page.
- The dashboard canvas no longer shows separate refresh/preview icons beside the report title; refresh and editing controls stay in the editor/tooling areas.
- PDF export uses the browser's native print renderer, so exact page breaks can vary by browser and selected print settings.


### Analyst / data-science intelligence layer (v11)

- Dataset-wide numeric summaries: valid count, sum, mean, median, quartiles, min and max.
- Missing-value and potential duplicate-record checks; nothing is automatically deleted.
- Potential outlier flags using the 1.5×IQR rule, with evidence and a human-review warning.
- Pearson correlation on paired non-missing numeric observations; results are labeled association, not causation.
- Coverage reporting for rows, columns, worksheet inventory and fields not auto-charted.
- Dashboard-level intelligence panels tailored to Executive, Exploratory, and Insights pages.
- Deterministic, local analysis; no paid AI provider or external model is called.

These statistical observations are heuristics, not a substitute for domain review or formal statistical inference. Multi-worksheet workbooks are inventoried, but only the selected worksheet is currently analyzed as a dataset; other sheets are explicitly listed as not analyzed.

- Secure registration/login with JWT + bcrypt
- Project workspaces
- CSV/XLS/XLSX upload up to 25 MB
- Automatic column/type profiling and data-quality metrics
- Adaptive dashboard generation based on each workbook's inferred fields, data types, semantic roles, dates, and category cardinality
- Shared numeric parsing for currency codes/symbols, US/European decimal/grouping separators, Indian digit grouping, percentages, and accounting-style negatives
- Automatic warnings for mixed numeric values and high-missingness columns; warnings appear with generated dashboards for review
- Category-only fallback dashboards using record counts when a dataset has no safe numeric measure
- KPI generation avoids incorrectly attaching the same saved measure to every generated KPI
- Workbook sheet inventory; automatically selects the most table-like populated worksheet and explicitly reports other sheets that were not analyzed
- Dataset-aware dashboard filters (filters from unrelated datasets are ignored instead of blanking charts)
- KPI values use compact notation (K/M/B) to prevent numbers breaking across multiple lines
- Full dataset explorer with search, exact filters, pagination and CSV export
- Server-side aggregation over the source file
- Bar, line, area, pie, donut, scatter and KPI visualizations
- Aggregations: sum, average, count, minimum and maximum
- Dashboard pages
- Dashboard theme switching
- Global dashboard filters
- Auto-build starter dashboard
- Drag-to-reorder visualization cards
- Resize visualization cards
- Duplicate/delete visualizations
- Persistent MongoDB dashboard configuration
- Version snapshots + restore
- View-only public share links + revoke
- Public shared dashboards render their real chart data
- Browser Print / Save as PDF
- Dataset and dashboard deletion
- Ownership checks on protected resources
- Activity logging foundation
- Responsive UI

## Exact MongoDB database

Use this exact database name:

`datacanvas`

Collections used:

- `users`
- `projects`
- `datasets`
- `dashboards`
- `visualizations`
- `activitylogs`
- `shares`
- `dashboardversions`

You may create only the database in MongoDB Compass. Mongoose creates collections automatically when documents are first inserted.

## Recommended MongoDB connection

Local:

`mongodb://127.0.0.1:27017/datacanvas`

MongoDB Atlas: use your Atlas URI and end it with `/datacanvas`.

## Requirements

- Node.js 20+ recommended
- npm 10+
- MongoDB local or MongoDB Atlas

## Run on Windows

Open two terminals.

### Terminal 1 — backend

```bat
cd DataCanvas\backend
copy .env.example .env
npm install
npm run dev
```

Backend: `http://localhost:5000`

### Terminal 2 — frontend

```bat
cd DataCanvas\frontend
copy .env.example .env
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Environment

Backend `.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/datacanvas
JWT_SECRET=replace_with_a_long_random_secret
CLIENT_URL=http://localhost:5173
UPLOAD_DIR=uploads
```

Frontend `.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

## First-use workflow

1. Open the frontend.
2. Create an account.
3. Create a project.
4. Import a CSV/XLS/XLSX file.
5. Open the dataset to inspect profile and rows.
6. Create a dashboard.
7. Use **Auto-build** or add charts manually.
8. Apply dashboard filters.
9. Drag cards to reorder and use resize controls.
10. Save a version.
11. Create a view-only share link.
12. Use Print / PDF to save a report.

## Architecture

```text
DataCanvas/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── uploads/
├── frontend/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── pages/
│       ├── services/
│       └── styles/
└── README.md
```

## Important implementation note

The application intentionally performs deterministic analytics rather than pretending to have AI. Uploaded source files remain in `backend/uploads`; MongoDB stores metadata, profiles, dashboard definitions and configuration. This keeps large spreadsheets out of MongoDB documents.

## Production deployment

For a production deployment, set a strong JWT secret, use MongoDB Atlas or a managed MongoDB server, configure CORS to your real frontend domain, use persistent storage for `backend/uploads`, and put the API behind HTTPS.

## Dashboard presentation styles (v4 refresh)

The Dashboard Studio includes three real UI styles selectable from the toolbar:

- **Analytics** — Power BI-inspired responsive 12-column canvas.
- **Executive** — warm report-style canvas with restrained teal accents.
- **Midnight** — dark navy analytics canvas with high-contrast cards.

The selected style is saved in browser storage for each dashboard. The dashboard layout also uses compact KPI cards, responsive chart widths, cleaner field selection, compact date labels, chronological time-series ordering and overflow-aware top-N aggregation. See `DESIGN_REFRESH_v4.md` for the detailed changes.

## Deterministic Auto Studio / Guided Studio Engine

This release includes the DataCanvas engine modules under `backend/src/engine`:

- Data sanitizer for duplicate/misaligned headers, null sentinels, and mixed numeric values
- Statistical and semantic profiler with confidence/cardinality signals
- Date topology analysis for calendar/business-day continuity
- Metric synthesis and granularity/aggregation safety guards
- Deterministic chart-selection rules with a maximum of seven visuals
- Responsive 12-column layout manifest for desktop/tablet/mobile
- Theme design tokens and scoped interaction/pub-sub metadata
- Unified immutable dashboard blueprint returned by the generation endpoint

The dashboard generation endpoint is `POST /api/dashboards/:id/generate`. It requires a valid bearer token and a `datasetId` belonging to the same project. Optional body fields include `pageId`, `mode` (`auto` or `guided`), and `options` (`theme`, `primaryColor`, `fontFamily`, `pinnedFields`, `excludedFields`, `maxVisuals`).

### Engine tests

From the project root, run:

```powershell
npm run install:all
npm test
```

The deterministic engine tests do not require MongoDB or an AI API key. Running the complete application requires MongoDB to be running or a valid Atlas URI in `backend/.env`.

### MongoDB

Database: `datacanvas`

Mongoose creates collections automatically as records are inserted. Expected collection names are `users`, `projects`, `datasets`, `dashboards`, `visualizations`, `activitylogs`, `shares`, and `dashboardversions`.

### Runtime verification note

The engine unit tests were run successfully in the build environment. A complete dependency installation and full frontend/backend production build could not be verified in this environment, so run the commands above on your machine after installation. No project can honestly be guaranteed error-free on every local setup without executing it there.

## V7 dashboard-generation update

- The **Rebuild 3 designs** action creates a fresh generation key each time and can select an alternate relevant measure/category when the dataset supports more than one.
- The three generated pages use different layout rules: KPI-led executive view, balanced exploratory view, and insight-led view.
- Dashboard generation remains deterministic for a given generation key and dataset; no external paid AI API is used.
- The engine cannot guarantee different chart content when a dataset has only one usable measure or one usable category. In that case, layouts and presentation still differ, and the limitation should be understood as a data constraint.

Database name: `datacanvas`. Mongoose creates collections when records are first inserted. Configure `backend/.env` from `backend/.env.example` before running.


## Data integrity notes

- Excel workbooks are inspected worksheet-by-worksheet. The ingestion step selects the most table-like populated worksheet for the dataset and records all worksheet names, dimensions, and hidden/visible state. Other sheets are explicitly shown as not analyzed; unrelated tables are never merged automatically.
- Dashboard generation uses the selected worksheet's actual columns and rows. Filters are only applied when their field exists in the visual's source dataset.
- KPI cards show compact values for readability (for example, `$2.45M`); hovering the value exposes the full numeric value.
- Automatic analysis is deterministic rule-based analytics, not a live LLM call. Unsupported metrics should be omitted or shown as unavailable rather than fabricated.


## Dashboard report export (v12)

The dashboard editor now provides **Open report**, **Export PDF**, and **Save PNG**. Export PDF opens the browser print dialog; choose **Save as PDF** for a clean landscape report. Save PNG captures the current dashboard page at 2x resolution. Open report hides editing controls and the application sidebar while preserving the current dashboard page and applied filter summary. The report is generated from the current dashboard visuals and loaded chart data. Install frontend dependencies after upgrading because `html2canvas` is now included: run `npm install` from `frontend`.

## Professional dashboard exports (v14)

Use **Export report** in Dashboard Studio to choose one of three real export actions:

- **Open as PDF** creates a paginated A4 landscape PDF and opens it in a new browser tab.
- **Download PDF** creates the same PDF and saves it directly to the computer.
- **Save as Image (PNG)** downloads a high-resolution PNG of the current dashboard page.

Exports include the selected dashboard page, report title, source filename, generation time, and active filter summary. Each dashboard page can be exported separately. The PDF is generated client-side with `jspdf` and `html2canvas`; no paid API is required.

After extracting this version, run `npm install` in the frontend folder to install the added `jspdf` dependency before starting the app.
