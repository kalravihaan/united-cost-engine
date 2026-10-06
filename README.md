# United Textile Mills · Cost Engine

Costing platform for a garment manufacturer. For one style it keeps two **independent** costing datasets and
shows them side by side:

* **Actual costing** – what producing the lot really costs (reproduces `actual costing.xlsx`).
* **Client costing** – the commercial cost / PO price quoted to the customer (reproduces `client costing.xlsx`).

CAD marker PDFs feed fabric consumption; every number carries its provenance; every save is a new immutable version.

> Study of the three source files and the field-by-field mapping: **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)**

## Run it

Requirements: Node 22, PostgreSQL 14+.

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # set DATABASE_URL (and optionally STORAGE_DIR, DEFAULT_USER)
npm run db:push                  # create the schema
npm run db:seed                  # import the three supplied source files (data/sources)
npm run dev                      # http://localhost:3000
```

Other scripts: `npm test` · `npm run typecheck` · `npm run lint` · `npm run build && npm start`.
Database integration tests run when `TEST_DATABASE_URL` points to a disposable database whose name contains `test`
(schema pushed with `DATABASE_URL=$TEST_DATABASE_URL npx prisma db push`).

### Import new costing files

* UI: **Imports** → drop an *actual* or *client* `.xlsx`.
* CLI: `npm run import -- actual path/to/actual.xlsx` / `npm run import -- client path/to/client.xlsx`.

Workbooks are stored unchanged, read structurally (anchor labels / header names – no fixed cell addresses), and every
sheet becomes version N+1 of that style's costing. Re-importing an unchanged workbook is a no-op; the whole import is one
transaction. Formula anomalies and ambiguities are listed in the report – never silently corrected.

## Using it (workflow)

1. **Customer / Brand** (masters, empty until you add them – the source files contain none).
2. **Style number.** Exact matches open directly; anything uncertain says *“Possible match found — please confirm”*.
   Unknown styles can be created.
3. **Style image** and **CAD PDF** upload (drag & drop). The CAD parser fills *CAD DATA*; doubtful values are marked
   **VERIFY** and are editable/confirmable.
4. **Category** (Core & Ultimate / Fashion / High Fashion – from the client workbook) sets the Overhead+Margin rate.
5. **Costing mode** Actual ⇄ Client. Edit quantities, rates, UOM, GST, descriptions and attributes; add/remove components;
   *Apply CAD to costing* feeds consumption. Save creates a new version; Export gives PDF / Excel (with live formulas).
6. **Comparison** tab: group-by-group Actual vs Client, premium %, margin economics, client price chain.

## Architecture

```
src/
  types/                 normalized schema (costing, rules) – no framework imports
  lib/
    parsers/             Excel readers: workbook.ts, actualCostingParser.ts, clientCostingParser.ts
    cad/                 CAD extraction: pdfText.ts, cadParser.ts (label based), preview.ts
    normalization/       labels, style matching (confidence-based)
    calculations/        THE calculation engine (pure functions), comparison, overrides, CAD mapping, templates, diff, explain
    validation/          document validation + API schema (zod)
  data/                  defaultRules.ts (editable defaults), masterConfig.ts (declarative masters)
  server/                prisma client, file store, repositories (the only code that touches the DB)
  services/              import, costing (versions + audit), CAD, style, rules, export (PDF/Excel)
  app/                   Next.js routes + thin API handlers
  features/              UI modules: costing, cad, styles, comparison, masters, imports
  components/            UI primitives
prisma/schema.prisma     PostgreSQL schema
data/sources/            the three supplied files = initial dataset and test fixtures
tests/                   vitest suites (engine, parsers, CAD, matching, validation, DB integration)
```

Rules enforced by structure: the engine imports nothing from React/Prisma/Excel; the UI calls engine functions but contains
no formulas; repositories are the only DB access; customer/brand mapping lives on `Style` and is never read by the engine.

### How the costing engine works
`calculateActualCost(doc)` / `calculateClientCost(doc)` (in `src/lib/calculations`) take a normalized `CostingDoc` and
reproduce the source formulas – actual: `E=C×B`, `Total Cost = trims + fabric + CMT + LD − D4`, `Cost per pc = Total ÷ dispatch pcs`,
`PROFIT`, `PER PC PROFIT`, profit %, value loss and `% value loss`; client: `L=G×K`, `O=L×N`, `M=L+O`, `Total`, Garment Rejection and
Overhead+Margin as **% of Total**, `Total Cost`, `FOB`, finance cost, `FINAL PO = FOB − finance`, transport, final incl. transport.
`explainCosting()` renders the chain with the source formula text (Calculation tab).

### Actual vs Client separation
Separate documents, separate engines, separate version histories (`Costing` is unique per `(style, type)`). Nothing derives one from the other;
a missing costing can only be started from the *structure* of another costing (values optional and flagged `TPL`).
`compareCostings()` maps lines of both into comparison groups through **editable rules** (Masters → Costing Rules) and lists unmapped lines.

### CAD extraction
`cadParser.ts` is label based, not coordinate based: header text lines → (label → value) segments using a synonym table (`LABELS`) →
unit conversion → confidence → cross-checks (Length ÷ Sets vs Length per Set, pieces totals, size breakdown, drawing style tags, Total Length plausibility).
Anything doubtful is `requiresVerification`; nothing is guessed; PDFs without a text layer produce empty, flagged fields.
CAD → costing is configured by `CadMappingRule`s: client *Main Fabric* quantity (per-garment consumption) and actual *CONSUMPTION* (B7). Actual fabric-order quantity (lot metres) is never overwritten.

### Provenance, overrides, audit
Every field can carry `Provenance {origin, ref, original}`. Editing an imported/CAD value records `OVERRIDE` and **keeps the original**
(`[CAD] 0.77 m → [Override] 0.80 m`, revertible). Versions store the document, engine output, engine version, changed fields, note, user and time;
`AuditEvent` is append-only (imports, saves, CAD edits, mapping changes, exports).

### Database
PostgreSQL via Prisma 7 (`prisma/schema.prisma`): masters (`Customer, Brand, Category, Style, StyleAlias, Uom, CostSection, CostItem, FabricMaster, RateMaster, CostingRule`),
files (`StoredFile`, `CadExtraction` revisions), costings (`Costing`, `CostingVersion` JSONB snapshots with indexed totals, `ImportBatch`) and `AuditEvent`.
Uploads go through a `FileStore` interface (local disk now, swap for S3/GCS).

## Known limitations & ambiguities

* **No authentication**: the acting user is a name sent as `x-user` and recorded on versions/audit; add real auth before multi-user use.
* **No customers/brands exist in the source files**, so none are seeded; style → customer mapping is manual (Masters → Styles or the top bar).
* **Style 72232 (CAD) has no costing** in either workbook; start one from a template. Style 5008 (client) has no Actual costing and none of the 28 actual styles has a client costing, so Actual-vs-Client for the *same* style is only available after both are created; otherwise the comparison needs an explicit, clearly flagged manual pairing.
* **CAD “Total Length 152.54 m”** is ≈ the 3.87 m marker in *inches* (39.4×); extracted as printed and flagged. The CAD contains only `FRONT BLOCK CUT 2`, so Length per Set may not be full-garment consumption (flagged).
* **Client “FINANCE COST 3%”** label vs formula `=L43*0`: the applied factor is an explicit input (source value 0); the label is a reference only. `FINAL PO = FOB − finance cost` is kept as in the source.
* Actual sheets contain formula quirks (next-row references in `E12/E13`, shifted rejection formulas in 8 sheets, `D41 + D50` in 2, `E37` including `E17` in 2, title/sheet mismatch in `2220`). The engine uses the canonical own-row `qty × rate`; all 28 sheets reproduce the workbook's cached values exactly.
* Comparison grouping (which actual lines compare with which client category) is an interpretation; it is configurable and shown line by line.
* Money is IEEE double like the source workbooks (display rounding only); indexed totals in SQL are `double precision`, the JSON snapshot is authoritative.
* CAD parsing needs a PDF text layer; layouts with unfamiliar labels need a synonym added to `LABELS`.

## Tests

`npm test` – 52 tests: Excel import of all 28 sheets (recomputed values equal the workbook's cached values), client chain (line-by-line L/M/O),
GST, finance/transport/final PO, CAD extraction (supplied PDF + alternative layouts + no-text-layer), style matching, validation, overrides,
CAD → costing mapping, comparison reconciliation, templates, version diffs, and (with `TEST_DATABASE_URL`) DB versioning/audit/import idempotency/CAD revisions.
