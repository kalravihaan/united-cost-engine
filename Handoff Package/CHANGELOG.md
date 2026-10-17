# Changelog (commit history)

Subject lines of the project's commits, oldest first. Each entry's story is told in `05_BUILD_HISTORY_AND_DECISIONS.md`. The hand-over itself (this folder) is the last entry.

| Commit | Date | Subject |
|---|---|---|
| `81604e5` | 2026-10-06 | Scaffold cost engine: normalized schema, Excel/CAD parsers, calculation engine, tests |
| `64ecdf1` | 2026-10-06 | Add cost engine application: database, API, UI, export, versioning, tests |
| `ebb0f49` | 2026-10-06 | Add docker-compose for local PostgreSQL and a local quick-start |
| `9a388f6` | 2026-10-06 | Add UI screenshots for documentation |
| `9c3ff0a` | 2026-10-06 | Rework: the engine is the system of record, reference workbooks only define structure |
| `3dad792` | 2026-10-06 | Add standalone simulator (browser build) and make exports runtime-agnostic |
| `e94a4c8` | 2026-10-07 | docs: scope findings from the real costing folder |
| `7a3ee67` | 2026-10-07 | Per-customer client costing layouts (GET + YOUSTA) |
| `a414764` | 2026-10-07 | Single-file build of the full Cost Engine |
| `72a7bb3` | 2026-10-09 | Second actual workbook: new rows, parser quirks, typed sums |
| `37f276b` | 2026-10-09 | Cost analysis across brands; MSME price and category tiers for the YOUSTA layout |
| `579d49a` | 2026-10-09 | Analysis: coverage of actual/client/CAD per style (six pairs), all-pairs comparison, every CAD marker |
| `a6d785b` | 2026-10-09 | Analysis page and Benchmarks tab: embed the cost analysis in the app (single-file HTML rebuilt, CAD unchanged) |
| `c737300` | 2026-10-09 | Load the analysis's standard rates into the Fabric and Rate masters |
| `3913240` | 2026-10-09 | Apply standard rates to a style's Actual costing |
| `124303e` | 2026-10-10 | Load the standard rates automatically when older data has none |
| `4ca9e38` | 2026-10-10 | Standard rates dialog lists every matching row; Live Smart naming; older standard loads refresh |
| `288254f` | 2026-10-10 | Delete styles from the Styles tab |
| `57d7cba` | 2026-10-10 | Review fixes: unsaved-costing leave guard, autosave flush, typed-sum rounding |
| `9d3235b` | 2026-10-17 | Docs: refresh README/DATA_MODEL stale lines; keep Handoff Package out of tsc and eslint |
| — | 2026-10-17 | Hand-over package (documentation, final HTML, source snapshot, reference data), browser smoke test and workbook verifier scripts |
