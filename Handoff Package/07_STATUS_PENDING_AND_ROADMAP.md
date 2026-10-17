# 07 — Status, pending work and roadmap

State at hand-over: 17 October 2026, the last commit before this package (`81567b7`) plus this package. Tests: 104 (96 without a database; 8 database tests also run against the in-browser store). Typecheck and lint clean. Final HTML: `deliverables/cost-engine.html` (rebuilding `project-source/` gives the same file apart from the ids/timestamp in its embedded seed).

## 1. Done (all verified; evidence in `09_…`)

**Core engine and workflow**
* Actual and Client costing engines reproducing the workbooks' chains; verified against every readable reference sheet.
* Default templates per mode (Actual: 55 rows; Client DEFAULT/GET: 34 rows; Client YOUSTA: 45 rows) learned from the reference workbooks; editable in *Templates*; per-style removal/restore of headers and rows; add components/headers.
* Client layouts per customer/brand (GET = Live Smart, YOUSTA); YOUSTA's CM amount row, no finance/FOB/transport, MSME price, category tiers, `excel update` sheet.
* Masters (customers, brands with layout assignment, categories, styles, aliases, UOMs, cost sections/items, fabric masters, rate masters, costing rules).
* CAD reading (label-based) with VERIFY flags and manual edits as new revisions; CAD → consumption mapping with provenance; one CAD per style.
* Provenance and overrides; immutable versions; audit trail; version history with changed fields; historic version open/"back to latest".
* Comparison Actual vs Client by group; Calculation tab (formula chain); Checks tab (validation).
* Excel (live formulas, customer layout) and PDF export; recalculation in LibreOffice matches the engine.
* Expression inputs (`4065+1617`), unsaved-costing leave guard, autosave flush.
* Style delete with impact list and typed confirmation.

**Analysis and guidance**
* Cost analysis of 58 unique actual sheets, 22–23 client sheets and the YOUSTA summary (`deliverables/analysis/cost_analysis.xlsx`, `project-source/docs/COST_ANALYSIS.md`).
* Analysis page; Benchmarks tab; standard rates in Fabric/Rate masters (versioned, auto-loaded when absent); opt-in "Standard rates" on an Actual costing.

**Deployments**
* Single-file HTML (`deliverables/cost-engine.html`): the real app with an in-browser database, autosave, Save/Open data file.
* Next.js + PostgreSQL server version.

## 2. Pending — needs a decision or input from the business owner

| # | Item | What is needed | Why it matters |
|---|---|---|---|
| P1 | **Passwords / unprotected copies** of five client workbooks (`GETKRTSFUT6002_`, `6002_[1]`, `6098`, `6099`, `6100`) | the passwords or copies saved without protection | `6100` has an actual sheet + CAD → second complete client-vs-actual pair; the others add client-side standards |
| P2 | **Colourways** | choose a design (see §4.1) | the workbooks hold one actual costing per colour (5008 × 6 colours with cost ₹197.80–220.02; 5009 × 2); the engine keeps one costing per style and mode |
| P3 | **Several CAD markers per style** | explain how markers map to fabrics (see §4.2) | 6206 needs the sum of three markers; 72232 has alternative layouts |
| P4 | **Production fields** | confirm they should be structured fields (see §4.3) | fabric received/used, pieces cut/shipped, shortage, fent are free text today |
| P5 | **Brand summary report** | confirm layout and where PO quantity/price comes from (see §4.4) | the YOUSTA cost summary is a third output (PO value, actual cost, margin by style) |
| P6 | **Variance warnings** | confirm thresholds (see §4.5) | the analysis found copied sheets, stale consumption defaults, ordered > received metres, unreported value loss |
| P7 | **Hosting, login, multi-user** | who uses it, where it is hosted | needed before more than one person works on live data |
| P8 | Classification confirmations | see §3 | Live Smart = all `…KRTS…` styles; meaning of CUT/FUT; the 2500/1800/1200 column |
| P9 | Value-loss and ordered-vs-received policy | should value loss reduce profit? cost on received metres? | the sheets do neither; changing them changes historic numbers |

## 3. Questions to put to the business owner

1. Do all `…KRTS…` styles (YETKRTS / RETKRTS / GETKRTS) belong to **Live Smart**? Any exceptions?
2. What do the series names **CUT** and **FUT** mean?
3. What is the quantity column (2500 / 1800 / 1200) beside the GET category table (Core & Ultimate / Fashion / High Fashion)?
4. For `6206`: does the solid fabric use a separate marker from the printed fabric? Are `1.10 + 0.78 + 1.35` additive, and what is the `+0.22 m` (allowance?) in the costing's consumption `=1.1+0.8+1.35+0.05+0.17`? For `72232`: are the block (0.77 m) and AADA (0.93 m) markers alternatives to the combined 1.52 m marker?
5. Colourways: should each colour have its own Actual costing with its own quantities (recommended), and should the Client costing be shared across colours with a "copy to colour" action?
6. Production fields wanted? Which exact fields and who enters them?
7. Should value loss be deducted from profit? Should fabric be costed on received rather than ordered metres?
8. Brand summary: which brands, which columns (PO quantity, PO cost/price, dispatched, actual cost per piece, margin, margin %)? Where do PO quantity and PO price come from?
9. The copied/mis-titled sheets: confirm and correct `0557` (copy of `0556`), the 5009 colour sheets (copied production notes), titles of `5005`, `6100`, `2220`; the `72300` client sheet (CM price 85 vs amount 75); the identical files `YAS26XWEWYF71718` / `YAS26ZWEWYF71717`.
10. Who will use the system, how many, and where will it be hosted (for authentication and storage choices)?
11. Should Rate/Fabric master rows be deletable, or only deactivated?

## 4. Designs for the pending features (proposals, not decisions)

### 4.1 Colourways
*Option A (recommended):* add `colourKey` (text, default empty = the base costing) to `Costing`: `@@unique([styleId, type, colourKey])`. Actual costing per colour (own order/dispatch quantities, fabric lot, value loss); Client costing normally shared (empty key) with a "copy to colour" action. Touches: `prisma/schema.prisma` (then `prisma generate`, `node standalone/gen-meta.mjs`), `costingService.getWorkspace/saveCostingVersion` (colour parameter), `GET /styles/[id]/workspace?colour=`, `useWorkspace` + a colour selector in `WorkflowBar`, `StylesPage` (costings per colour), comparison (client vs which colour? weighted across colours by dispatch), export file names, delete-style (cascade is automatic), analysis (colour sheets already in the dataset), tests (DB + memory store).
*Option B (cheapest, weaker):* one style number per colour (`5008-fuchsia`) with aliases. Duplicates the style list and breaks "one style, many colours" reporting; this is what the workbooks implicitly do.
**Ask first:** P2/Q5.

### 4.2 Several CAD markers per style
`CadExtraction` rows already exist per file; today only the latest is read. Proposal: show all markers of a style (CadPanel list); let the user mark each as *include in consumption* (sum) or *alternative*; allow assigning a marker (or "sum of …") to each fabric line; write the Actual consumption as the **expression** (`consumption.formula` already stores typed sums, e.g. `=1.1+0.8+1.35`) with provenance CAD and an explicit allowance field; extend `CadMappingRule` (`src/types/rules.ts`) and `applyCadToCosting` accordingly; validations: marker style number vs style, widths per fabric. Keep "never guess": nothing is summed unless the user ticks it. **Ask first:** P3/Q4.

### 4.3 Production fields
Add `ActualParams.production { fabricReceivedM, fabricUsedM, cutPcs, shippedPcs, shortagePcs, fentM }` (plus note), a panel on the Actual costing, and derived read-only metrics: real consumption = fabric used ÷ cut pieces (compare with CAD and the cell); ordered vs received metres; shortage. They feed variance warnings (§4.5). Parser: map the free-text notes in columns G/H where unambiguous (the analysis sheet "5c Production reconciliation" already parses them). **Ask first:** P4/Q6.

### 4.4 Brand summary report
A page/report across styles: PO quantity, PO price/cost, dispatched, actual cost per piece, margin and margin % per style, with brand totals; Excel output in the YOUSTA summary's layout (`reference-data/brand-summary/YOUSTA COST SUMMERY.xlsx`). The summary's "actual cost" equals the actual sheet's cost per piece for 12 of 17 styles (the other five differ by ₹0.01–0.68). PO quantity/price do not exist in the engine today → add them to the style or colour (or to a PO entity). `Total Qty` on the YOUSTA `excel update` sheet would then be filled. **Ask first:** P5/Q8.

### 4.5 Variance warnings (extend `validate.ts` and/or Benchmarks)
Candidates taken from the analysis: costed consumption vs metres purchased per piece drifting > 15 %; ordered metres > received metres; value loss > 3 % of cost; profit % < 10 %; CMT above the segment band; sheet identical to another style; CAD length vs costed consumption (> 7 %). Show as Checks warnings, not errors; thresholds editable in Masters → Costing Rules.

### 4.6 Authentication, multi-user, hosting
Replace the `x-user` header with real sessions (e.g. an auth library or the host's SSO), add roles (clerk, approver, admin), use managed PostgreSQL, implement the S3/GCS `FileStore`, add backups, review the security checklist in `09_…`. The single-file build stays as the offline/personal version.

### 4.7 Smaller items
* Delete (or deactivate) Rate/Fabric master rows (R-19). * Fill `Total Qty`. * Remove the unused `/costings/start` route and the stale `simulator/`. * A "recoverable delete" if wanted (R-18). * Keep README test counts in sync (or generate them).

## 5. Recommended order of work

1. **Run the checks** (`08_…`) and read `09_…`; confirm the environment works (`npm run verify:workbooks`, `npm test`, `npm run test:standalone`, `npm run smoke:standalone`).
2. **Unblock data:** ask Q1–Q11; obtain the passwords (P1). If 6100 opens, add it to `reference-data/`, run `npm run verify:workbooks`, re-run the analysis pipeline, refresh the snapshot, rebuild.
3. **Finish the unreviewed areas** (a proportionate pass: API bad-input behaviour, concurrent saves, uploads, hostile PDFs, other browsers; see `09_…`) before adding features that increase surface area.
4. **Colourways → production fields → brand summary report** (they build on each other and unlock the variance warnings).
5. **Several CAD markers** once the owner has explained the mapping.
6. **Hosting + authentication** when more than one person needs live shared data.
7. After every change: tests on both stores, rebuild the HTML, smoke test, update README/docs counts, and send the owner the rebuilt `cost-engine.html` with a plain-language summary and what to look at.
