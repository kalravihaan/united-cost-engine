# 09 — Testing and verification

## 1. The automated suite (`project-source/tests`, vitest)

104 tests in 11 files. Without a database 96 run and 8 are skipped; with `TEST_DATABASE_URL` all 104 run. The 8 database tests are also run against the in-browser store (`npm run test:standalone`).

| File (tests) | What it really proves |
|---|---|
| `actual-import.test.ts` (7) | every worksheet detected with style numbers kept as text; structure, labels, source cells and formulas read without hard-coding; variable components (CMT KURTA + CMT BOTTOM, differing fabric labels); formula anomalies reported, not silently fixed; the engine's canonical recompute equals the workbook's own cached values on all **28** sheets; known values (78290, the value-loss sheets); every source line total equals the workbook's cell |
| `actual-import-2.test.ts` (10) | the same for all **35** sheets of the second workbook; rate typed in column D (value loss ₹6,160); text-as-number warning; typed sums keep value + expression; template union grows to 55 rows; every row of both workbooks lands in a comparison group |
| `client-import.test.ts` (8) | the client chain on the real GET sheet: structure and distinct quantity/UOM/rate/GST/attributes; every line (L base, O GST, M with GST) and the summary chain; Garment Rejection and Overhead+Margin are percentages of **Total** (not of Total Cost, not of quantity); GST arithmetic; finance cost, transport and final PO price; the finance factor is an explicit input flagged ambiguous (label 3 %, formula ×0); changing an input recalculates and keeps the original |
| `client-formats.test.ts` (15) | layouts: YOUSTA parsing and totals on real sheets, CM as an amount row, no finance/transport rows, MSME price, category tiers, typed values reproducing two real customer sheets' totals, Excel output per layout (sheet names, headers, `excel update` sheet), brand/customer layout resolution, template unions across workbooks |
| `cad.test.ts` (7) | the supplied CAD (#72232: 3.87 m, 53", 68.47 %, 0.77 m per set, 10 pieces); the ambiguous Total Length (inches labelled m) is flagged, not interpreted; alternative layouts (order, separators, units); length per set derived only as an unconfirmed suggestion; inconsistent values / missing unit flagged; a PDF without a text layer yields flagged empties (never guessed) |
| `matching-validation.test.ts` (14) | style matching — only exact normalised equality is automatic; `GETKRTSCUT5008 - BLACK` and leading-zero cases are *possible* matches; an unknown style has no match; one-character differences are low-confidence suggestions; a confirmed alias matches exactly and duplicates stay ambiguous; CAD ↔ entered style — and validation: missing style/customer/CAD, CAD style mismatch, unverified CAD consumption/missing width, line-level errors (negative, missing rate/qty/UOM, bad GST, duplicates), untouched template slots raise no errors, missing dispatch pieces blocks cost per piece, no override applied silently |
| `comparison-cad-mapping.test.ts` (11) | comparison is computed from the underlying lines and reconciles to both totals (two real costings paired explicitly in the test); actual fabric group = fabric line ÷ dispatch pieces; **no unmapped lines across all 28 first-workbook sheets** with the default rules; CAD → costing (length per set → client Main Fabric quantity with the imported value kept as original; → actual CONSUMPTION but never the lot-level fabric quantity; a value needing verification is not used until confirmed; non-length UOM skipped); overrides (`[CAD] 0.77 → [Override] 0.80`, kept, used, revertible; typing into an empty field is MANUAL; removed lines flagged, never deleted); template structure/values modes; version diffs |
| `templates.test.ts` (9) | default templates are structure only (every header and row, no values, no style data; client keeps categories, UOM and GST defaults); a new costing starts with all rows and calculates when values are entered; CAD feeds a template-based costing; removing a header drops its rows from totals and can be restored; template editing compacts removed rows; validation ignores removed headers; the expression evaluator (`4065+1617`, `0.1+0.2 = 0.3`, junk rejected) |
| `benchmarks.test.ts` (8) | segment detection (YOUSTA / Live Smart 5xxx / 4xxx-6xxx, brand and layout signals), fabric typing, benchmarks on real sheets read "within" their own segment, "above" when costs are doubled, fallback when a segment has no plain sheet, standard-rate rows (names, values, unique) |
| `apply-standards.test.ts` (7) | opt-in standard-rate planning: only CMT/trims/add-ons; never fabric rows or quantities; family-specific trims; set CMT for long garments; typed/overridden rates are kept; imported value kept as `original`; user master wins; empty master → empty plan |
| `db-integration.test.ts` (8, database) | templates built from the reference workbooks create no style/costing; template edits versioned; saving costings creates immutable versions with audit; Actual and Client independent; CAD upload/edit revisions; layout resolution brand → customer → default; standard rates load/ensure/refresh without touching user rows; delete style (cascade, blobs, audit kept, number reusable) |

Tolerances: the verification tests compare with a relative tolerance ≤ 1e-9; `verify:workbooks` uses 1e-6.

## 2. Verification scripts (kept in the repo; run them)

| Command | What it checks | Result at hand-over |
|---|---|---|
| `npm run verify:workbooks [dir …]` | every readable workbook parses and the engine matches its cached values | over `reference-data/`: **30 files (5 protected, unreadable), 85 sheets (63 actual + 22 client), 766 values, 0 differences** |
| `npm run verify:export` (needs LibreOffice) | exports 6 costings to Excel (3 actual sheets incl. value loss and rate-in-column-D, GET client, YOUSTA with MSME), recalculates each in LibreOffice and compares every live formula | **6 files, 387 formulas (221 non-zero), 0 differences** |
| `npm run smoke:standalone` | real-browser walk of the single file (13 checks): seeded standards, brand/style creation, Actual entry with live total, Benchmarks, Standard rates dialog + apply, Save as v1, Excel download, leave guard, typed-confirmation delete, no console errors | **13/13 passed** on `deliverables/cost-engine.html` |

## 3. What was verified by hand and how (reviews)

* **Solo review (17 Oct, scope: engine, exports, evaluator, docs):** 780 engine values vs workbook cached values over all actual and readable client sheets: only difference = sheet `4112`'s two value-loss cells where Excel itself shows an error. Expression evaluator probed with 28 realistic/hostile inputs (precedence, Indian grouping, `--3`, `1 2`, `10/0`, `50%`, `1e3`, unicode digits) — all behaved; one defect found (floating-point tail) and fixed. Spreadsheet-formula injection: item text `=1+1`, `@SUM(A1)`, `+cmd|…` is written as plain text, not as a formula. Quantity bases for standard rates (CMT ≈ 1.00 per dispatched piece, labels ≈ 1.0, cartons ≈ 0.02, add-ons ≈ 1 per piece) match the units the standards were computed from. Docs checked for stale statements (several fixed).
* **Earlier checks:** the application was run in a real browser at each stage; the exports were opened; CAD reading was compared with the PDFs' text; the in-browser store passes the same database tests as PostgreSQL; the final HTML rebuilds from the source snapshot to a file of the same size with identical application code (only the ids/timestamp in the embedded seed differ).
* **Defects found by the business owner in use (all fixed):** wrong concept (R-01); "only 5008 has both" analysis claim; empty standard rates on old browser data; the Standard-rates dialog showing "nothing to apply"; the brand name.

## 4. NOT verified — start here if you want to harden the project

The multi-agent review that was meant to cover these was cancelled before any reviewer finished, so none of this is independently reviewed:

1. **API under bad input** — malformed JSON, wrong types, NaN/Infinity/huge numbers, unknown master names, invalid ids, wrong methods; error messages must not leak internals.
2. **Concurrency** — two saves of the same costing at once (`(costingId, versionNo)` is unique, so one must fail cleanly rather than create a duplicate or 500); concurrent template edits.
3. **Uploads** — type sniffing and size limits for the image and CAD routes; hostile PDFs through pdf.js; the files route (path traversal is guarded in `LocalFileStore`, untested); SVG/inline content type.
4. **Security review** — no authentication; XSS in rendered data (item names, notes); data-file import (`memdb.restore` ignores unknown tables but is not hardened against `__proto__`-style keys); dependency versions (pdfjs-dist, exceljs, next).
5. **Standalone parity beyond the 8 DB tests** — a differential test running identical operations on PostgreSQL and `memdb.ts` for every query shape used in `src/`.
6. **Other browsers** (Firefox, Edge, Safari) and small screens; accessibility.
7. **Scale** — hundreds/thousands of styles, large data files, autosave cost.
8. **UI logic** — React hooks (`useWorkspace`: switching style while a load is in flight, historic versions, discard, layout switching) have no unit tests; only the smoke test and manual runs.
9. **Mutation testing** of the suite (do the tests fail when a calculation line is altered?).
10. **PDF exports** — compared for text and numbers only by eye/early checks; no automated PDF assertions.
11. The `docker-compose.yml` was never run (Docker unavailable in the original environment).

Suggested proportionate pass: items 1–3 and 5 first (cheap, highest value), then 8 and 9.

## 5. How to add a test

* Engine/parser tests use the fixtures in `tests/fixtures.ts` (cached parses of the reference workbooks). Prefer asserting against the **workbook's own values**, not the engine's output.
* Database tests go in `tests/db-integration.test.ts` and must pass on both stores; they reach services through the `m` object set up in `beforeAll`.
* After any change: `npm run typecheck && npm run lint && npm test && npm run test:standalone`, then `npm run standalone:build && npm run smoke:standalone`. Update the test counts in `README.md`.
