# DataCanvas Studio V5 — UI refinement

This refresh improves the existing analytics studio UI without changing the API or MongoDB schema.

## What changed
- Clearer page hierarchy, spacing, buttons, filters, builder sidebar, and chart cards.
- More legible chart titles and KPI values; fewer controls compete for space on narrow KPI cards.
- Improved desktop, tablet, and mobile dashboard grid behavior.
- More consistent visual treatment for Analytics, Executive, and Midnight styles.
- Preserves existing backend routes, saved dashboards, uploaded data, and authentication.

## Apply / run
This archive includes the refreshed frontend CSS in `frontend/src/styles/global.css`.
From the project root:

```powershell
npm run dev
```

If dependencies are not installed yet, run `npm run install:all` first. Make sure the backend `.env` is configured and MongoDB is running before using data-dependent features.

Note: this is a UI refinement of the current V4 codebase, not a claim that every planned Power BI feature is implemented or that the app has been runtime-certified on every machine.
