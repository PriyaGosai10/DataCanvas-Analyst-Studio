# DataCanvas Engine Phase 1 — QA Report

## Passed in this workspace

- Pure engine TypeScript modules compiled with strict TypeScript checking using the globally available compiler.
- 9 isolated engine tests passed:
  1. Mixed currency values and null sentinel normalization.
  2. Empty dataset rejection.
  3. Duplicate header handling.
  4. Responsive grid contracts and 7-visual cap.
  5. Gujarati semantic field alias recognition.
  6. Sequential ID and narrow-range rating aggregation guards.
  7. Business-day date topology.
  8. Unsafe repeated budget/grain detection.
  9. Reproducible seed for identical dashboard input/configuration.
- Syntax parsing passed for all 58 TypeScript/TSX files.
- JSON parsing passed for all package manifests and the Dashboard Blueprint schema.

## Not certified in this workspace

- Full application `npm run build` and browser/MongoDB end-to-end tests were not completed here because dependency installation timed out in this environment.
- The 9 passing tests exercise the pure engine modules, not the Express/Mongoose route or browser UI.
- Run `npm --prefix backend test` on the already-installed Windows project to validate the complete backend compile plus engine tests locally. Then use the Auto-build button for end-to-end validation.

## Known phase-1 limits

- Interaction dependency metadata is generated, but cross-filter events are not yet wired into the React renderer.
- Header detection skips common single-cell report-title rows; unusual multi-cell metadata rows may still need user review.
- Business-grain inference is conservative. Budget/target fields are blocked from auto-summing unless safe grain can be established; user-declared grain editing is future work.
- PDF is currently browser print-to-PDF, not a server-side pixel-perfect export pipeline.
