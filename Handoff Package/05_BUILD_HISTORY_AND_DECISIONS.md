# 05 — Build history and decisions

How the project got here, in order, with the reasoning. Dates are the commit dates (October 2026). The "business owner" is the person who commissioned the work and answers the domain questions; their corrections are authoritative.

## Part A — Chronology

### Stage 1 · Study and plan (6 Oct)
The original specification (`02_…`) came with three real files: an actual-costing workbook (28 sheets), a client-costing workbook (style 5008, GET layout) and a CAD marker PDF (style 72232). Following the spec's phased approach, every sheet and formula was studied first and written up as a field mapping (`project-source/docs/DATA_MODEL.md`). Before committing to PostgreSQL + Prisma the stack was proven in the working environment (Prisma 7 with the pg adapter; stable versions pinned because the CLI initially resolved to a release candidate).
**Result of the study:** the actual workbook is one fixed-row template with variable labels; the client workbook has a precise chain (`L=G×K`, `O=L×N`, `M=L+O`, percent rows on Total, FOB, finance cost, final price); the CAD is label-based text with a unit trap (Total Length in inches labelled "m").

### Stage 2 · First full build (6 Oct, commits `81604e5`, `64ecdf1`)
Normalized schema and parsers; the calculation engine verified against all 28 actual sheets and the client sheet line by line; the label-based CAD parser; schema/repositories/services/API; the editable costing UI with provenance tags and override controls; comparison, calculation chain, checks, versions, audit; Excel (live formulas) and PDF export; 52 tests. **This build imported the workbooks as 28 + 1 styles and displayed them.** It was pushed with a local-run guide (`docker-compose.yml`).

### Stage 3 · The concept correction (6 Oct, `9c3ff0a`)
When the business owner asked how to see it, a read-only clickable preview was built from the imported styles. The owner then explained the actual intent (see `01_…`): the engine **replaces** the Excel; costing values are **entered**; the files are reference; only CAD (and the image) is uploaded; Actual and Client are different in their particulars; **each mode opens with all its rows and headers with an option to remove unwanted ones per style.**
**Rework:** the import feature, the Imports page and the 28 imported styles were removed; `CostTemplate` (default structure per mode) was introduced and built from the reference workbooks; per-style removal/restore of headers and rows, add component/header, a Templates admin (edit structure, rebuild from a workbook); comparison compares Actual and Client of the **same style** only (the earlier "manual pairing" was removed). 59 tests.

### Stage 4 · Making it usable without developer tools (6 Oct, `3dad792`)
The owner could not install Node or Docker. A **browser simulator** (one HTML file built with esbuild, same calculation/CAD/export code, data in the browser) was built and published as a shareable page so a couple of styles could be tried with real CAD uploads and exports. Exports were made runtime-agnostic (`lib/export/documents.ts`). The simulator is a trial tool; it was later superseded (Stage 7) and is no longer maintained.

### Stage 5 · The real scope (7 Oct, `e94a4c8`, `7a3ee67`)
The owner supplied a folder of real files (many styles, CAD PDFs, client sheets for two brands, a YOUSTA cost summary) — see `10_DATA_INVENTORY.md`. Findings (`project-source/docs/REAL_SCOPE.md`): GET sheets matched the engine; the CAD reader read all four CADs; **the YOUSTA client sheets use a different layout** and mis-totalled under the GET assumptions; five GET client workbooks were password protected.
**Built:** per-customer/brand **client layouts** (`ClientFormat`, templates keyed by `(type, formatKey)`, layout learned from a customer's sheet, assigned in Masters, resolved brand → customer → default), the **YOUSTA layout** (Print/Emb/Washing header, CM as a single amount row, no finance/FOB/transport, final price NON-MSME), Excel/PDF in each layout (YOUSTA's `revised format` sheet and `excel update` sheet), and real-sheet tests. 71 tests.

### Stage 6 · The single-file product (7 Oct, `a414764`)
On the owner's request ("a standalone HTML file for the cost engine — the actual engine, not the simulator") the **entire application** was rebuilt as one HTML file: a schema-driven in-memory Prisma-compatible store, a `fetch` shim running the real route handlers, Save/Open data file, IndexedDB autosave (details in `04_…` §8). The existing database integration tests pass against both PostgreSQL and the in-memory store, which is what makes the single file trustworthy. 71 tests on PostgreSQL + 6 on the memory store.

### Stage 7 · Second actual workbook (9 Oct, `72a7bb3`)
A further actual workbook (35 sheets, the Live Smart "cost closer") had the same layout but new rows and quirks: **photo tag**; "frieght" spelled two ways; **fabric finishing/printing** as a second fabric line (22 sheets); add-ons one row per kind (the Actual template grew from 40 to 55 rows, learned from both workbooks); **rate typed in column D**; **text typed as a number**; **sums typed into cells** (so number inputs got expression support); wrong titles; production notes. Colourways (one actual sheet per colour) were identified as a gap and left for the owner's decision. 83 tests (+6).

### Stage 8 · Cost analysis, MSME, category tiers (9 Oct, `37f276b`, `579d49a`)
`2243 COSTING.xlsx` turned out to be a newer YOUSTA layout (extra sewing rows, **MSME price**). The YOUSTA layout gained the MSME price and its **category tiers** (8/10/12 %) instead of a fixed 12 %. All costing data was analysed (58 unique actual sheets, 22–23 client sheets, the brand summary): families, standard cost per segment, fabric rates, consumption vs CAD, CMT, embellishment, trims, margins, client-vs-actual, data issues (`project-source/docs/COST_ANALYSIS.md`, `deliverables/analysis/cost_analysis.xlsx`). 87 tests.
**A mistake and its correction:** the first analysis said style 5008 was "the only style with both an actual and a client costing". The owner challenged it; checking all 68 style numbers across all files showed **six** styles have both (5008 complete; 71429, 71447, 72145, 74643 YOUSTA drafts with blank fabric; 6100 protected). The analysis, coverage sheet and docs were corrected.
Also in this stage: all CAD markers were read (11 PDFs; 6206 and 72232 have several markers per style); the owner asked why one style can need several CADs (answer in `03_…` §6) and chose to **keep CAD handling as it is for now**.

### Stage 9 · The analysis inside the product (9 Oct, `a6d785b`)
The **Analysis** page (all tables, CSV per table) and the per-style **Benchmarks** tab (cost/pc, fabric, embellishment, CMT, landed fabric rate, consumption, purchase allowance, sale rate, profit % against the segment standards, within/below/above range) were added; the analysis is an embedded snapshot. 94 tests.

### Stage 10 · Standard rates (9–10 Oct, `c737300`, `3913240`, `124303e`, `4ca9e38`)
At the owner's request the standards were **loaded into the Fabric and Rate masters** and an opt-in **"Standard rates"** action was added to an Actual costing. Two defects were found by the owner and fixed: (1) the saved browser data predated the standards so the masters were empty → auto-load when absent (`?ifMissing`) and a version tag so older loads are replaced; (2) the dialog hid rows without a quantity and said "nothing to apply" → it now lists every matching row (quantity rows first) and explains an empty result. The owner also stated that **the GET format is the brand Live Smart**, so the family previously labelled "KRTS (GET/YET)" was renamed Live Smart everywhere (analysis, masters, benchmarks, docs). 103 tests.

### Stage 11 · Delete style (10 Oct, `288254f`)
Styles can be deleted from the Styles tab with a typed confirmation and an impact list; audit events are kept. 104 tests (+8 on the memory store).

### Stage 12 · Review (10 Oct, `57d7cba`)
A full in-depth review was requested. A 13-reviewer, verify-each-finding multi-agent review was launched and then **cancelled before any reviewer finished**, so it produced no findings (see `06_…`). A smaller solo review followed: engine vs workbooks (780 values), Excel exports recalculated in LibreOffice, expression evaluator, docs. Three real problems were fixed: an **unsaved-costing leave guard**, **autosave flush on tab close**, and **typed-sum rounding** (`0.1+0.2`). Nothing else was found in the areas covered.

### Stage 13 · Hand-over (17 Oct)
This package: documentation, the final HTML, a source snapshot, de-identified reference data, a browser smoke-test script and a workbook verifier script; stale lines in README/DATA_MODEL refreshed.

Test-count progression: 52 → 59 → 71(+6) → 83(+6) → 87 → 94 → 103 → 104(+8).

## Part B — Corrections the business owner made (authoritative)

1. "The purpose of the cost engine is to replace the Excel… the costing files were for reference purposes only, only the CAD will be uploaded… the values will be entered in the engine." (Stage 3)
2. "The actual vs client costing logic is correct of the 2 being different but the particulars of both differ; by default each mode will have all its rows and headers with an option to remove unwanted headers for that style." (Stage 3)
3. "I am talking about the actual cost engine and not the simulator" — the finished product must be the real application in one file. (Stage 6)
4. "How is 5008 the only style with both… there ought to be more." (Stage 8; the owner was right.)
5. "The GET format is for the brand Live Smart." (Stage 10)
6. "Keep CAD as it is for now" (several markers per style deferred). (Stage 9)

## Part C — Decision records

Format: **decision** — why — consequence / where.

**DR-01 Stack: Next.js + TypeScript + PostgreSQL/Prisma.** The spec recommended it and it was proven working before adoption. Needs Node 22 + PostgreSQL for the server version.
**DR-02 One normalized `CostingDoc` for both modes with per-line, per-field provenance.** Satisfies traceability and override requirements without bespoke tables per sheet. `src/types/costing.ts`.
**DR-03 Engine uses the canonical own-row `qty × rate` and reports (does not copy) the sheets' formula anomalies.** The anomalies are errors in empty slots; copying them would make results depend on copy-paste accidents. All readable sheets still reproduce the workbooks' totals.
**DR-04 Actual and Client are separate documents, engines, histories.** `Costing` unique per `(style, type)`. Required by the spec; confirmed by the owner.
**DR-05 CAD is read by labels, never coordinates; nothing is guessed.** Different CAD layouts must work; uncertain values are editable and flagged. `Total Length` is flagged because it is in inches.
**DR-06 CAD feeds only consumption fields.** Client `Main Fabric` quantity (per garment) and Actual `CONSUPMTION`; the Actual fabric line quantity (lot metres) is never overwritten because it is a purchase quantity, not consumption.
**DR-07 Finance cost factor is an explicit input.** The label says 3 % but the source formula multiplies by 0; applying 3 % silently would change prices. `FINAL PO = FOB − finance` preserved.
**DR-08 Comparison grouping is an editable rule set.** The mapping between actual lines and client categories is an interpretation; unmatched lines are listed.
**DR-09 The engine is the system of record (Stage 3 rework).** Templates replace imports; reference workbooks teach structure only.
**DR-10 Default template = union of every reference workbook; editable; versioned; affects new costings only.** A plain style therefore needs a few removals; this is accepted.
**DR-11 Client layouts as data (`ClientFormat`).** Customers have different sheets; layout is chosen by brand → customer → default, switchable until the first save, then fixed. Export follows the layout.
**DR-12 YOUSTA specifics.** CM as `ENTERED_AMOUNT`; price chain configured by `pricing` (no finance/transport; final price label; MSME); Overhead+Margin by category, not 12 % fixed; the `excel update` sheet reproduced by live formulas.
**DR-13 Number inputs accept expressions.** The sheets have typed sums; the app keeps the value and the typed formula. Evaluator is a restricted arithmetic parser (no `eval`).
**DR-14 Second-workbook canonicalisation.** "frieght"→"freight"; one template row per add-on kind; a generic "Fabric finishing / printing" row; photo tag added; rate-in-column-D and text-as-number handled with warnings.
**DR-15 The single-file build runs the real code.** A generic schema-driven Prisma-compatible store plus a fetch shim, instead of a second implementation. Parity is *proven* by running the same database tests on both. Persistence = IndexedDB autosave **and** an explicit data file (browsers can clear storage; the file is the real backup).
**DR-16 Analysis methodology.** Medians (robust to outliers) with min/max; sheets de-duplicated across workbooks (5 YOUSTA sheets appear twice); brand family inferred from product IDs; landed fabric rate = (purchase + finishing) ÷ metres bought; kurta vs set threshold 2.2 m; embellished = embellishment cost > ₹1/pc; profit as the sheets compute it (value loss not deducted); samples under 5 are indicative.
**DR-17 Benchmarks and standard rates are guidance.** Embedded snapshot, read-only comparison, masters loaded with versioned source tags, applying to a costing is opt-in per row, never touches fabric rows, quantities or rates a person typed, and is reversible (original kept; Discard).
**DR-18 Fabric rows are never auto-priced.** The standard fabric figure is a *landed* rate (purchase + finishing) and depends on supplier; applying it to the purchase row would double-count the finishing row.
**DR-19 Brand naming.** The KRTS product family is Live Smart; its GET layout is the default client layout (label "Live Smart (GET layout)").
**DR-20 Segment detection.** Explicit signals first (YOUSTA layout/brand/prefix `YAS`; `KRTSFUT/CUT` in the product ID; brand Live Smart or the style's assigned default layout), then number shape. Callers pass the style's **assigned** layout, never the display fallback.
**DR-21 Hard delete of a style, with a typed-number confirmation and an impact list; audit trail retained.** Costings/versions/CAD/uploads/aliases are removed; blobs are removed unless shared by another record; earlier audit events are detached with the style number added; the number can be reused. A soft-delete/archive was not built (see `06_…`).
**DR-22 Unsaved guard counts only entered values.** A fresh untouched template draft must not trigger a warning (it is "dirty" internally only so *Save as v1* is enabled).
**DR-23 Tests that touch the database run against both PostgreSQL and the memory store.** Any new Prisma query shape must stay inside what `memdb.ts` supports.
**DR-24 Honest reporting.** Wrong claims (e.g. "only 5008") are corrected in the analysis, docs and workbook, not just in chat.
