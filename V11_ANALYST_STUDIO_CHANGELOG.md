# DataCanvas v11 — Analyst Studio improvements

## Added
- New authenticated `GET /api/analytics/:id/insights` endpoint, protected by dataset ownership checks.
- Dataset-wide field profiling with valid numeric counts, missingness, unique counts, min/max, mean, median, quartiles and sum.
- Potential duplicate complete-row signatures are flagged but never deleted.
- Potential outliers are detected with the 1.5×IQR rule and include threshold evidence.
- Pearson correlations are calculated only from paired non-missing numeric observations and labeled as association, never causation.
- Analysis coverage includes worksheet inventory, selected worksheet, fields not automatically charted and limitations.
- Dashboard page-specific intelligence panels for Executive Overview, Exploratory Analytics, and Insights/Risks/Actions.
- Responsive styling for evidence cards, coverage stats, numeric profile tables, correlation findings, and quality warnings.

## Existing limitations kept explicit
- This is deterministic data analysis, not a live LLM/AI model.
- The workbook parser inventories all worksheets but currently analyzes one selected worksheet at a time; it does not automatically join unrelated worksheets.
- Global dashboard filters currently update visual aggregations; the dataset-wide intelligence panel reports source-level findings and does not claim to be filtered.
- Browser print is still the PDF export route.
- Full browser + MongoDB end-to-end runtime verification must be completed in the user's environment.

## Validation
- TypeScript syntax parsing is run across all source files when packaging.
- Dependency-backed production builds are not claimed unless dependencies are available and the build actually completes.
