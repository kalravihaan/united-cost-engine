# United Textile Mills · Cost Engine

Costing platform for a garment manufacturer. **The engine replaces the Excel sheets**: costing values are entered here,
and Excel / PDF are *outputs* of the engine. For one style it keeps two **independent** costings, each with its own
particulars, and compares them:

* **Actual costing** – what producing the lot really costs (structure of `actual costing.xlsx`).
* **Client costing** – the commercial cost / PO price quoted to the customer (structure of `client costing.xlsx`).

Only the **CAD PDF** (and the style image) are uploaded. The two reference workbooks were used to learn the *structure*
(headers, rows, formulas, terminology); no style or costing data from them is stored.

* Each mode opens with **all of its default headers and rows**, empty. You enter values and remove the headers/rows a style does not need.
* CAD consumption feeds the fabric lines; every number carries its source; every save is a new immutable version.

> Study of the reference files and the field-by-field mapping: **[docs/DATA_MODEL.md](docs/DATA_MODEL.md)**

## Try it locally (fastest path)

```bash
docker compose up -d            # PostgreSQL (skip if you already have one; then edit DATABASE_URL in .env)
cp .env.example .env
npm install
npm run setup:local             # creates the tables and the default templates
npm run dev                     # open http://localhost:3000
```

Suggested tour: type a new style number (e.g. 72232) → *Create style* → upload its CAD PDF (the sample is `tests/fixtures/cad_72232.pdf`) →
*Client costing*: all rows are there; *Apply CAD to costing* fills Main Fabric → enter rates and quantities → remove a header you do not
need (bin icon) → *Save as v1* → switch to *Actual costing*, enter its values → *Comparison* tab → *Export* PDF / Excel → *Templates* to edit the default rows.

## Run it

Requirements: Node 22, PostgreSQL 14+.

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # set DATABASE_URL (and optionally STORAGE_DIR, DEFAULT_USER)
npm run db:push                  # create the schema
npm run db:seed                  # default costing templates + rules (no styles, no costing data)
npm run dev                      # http://localhost:3000
```

Other scripts: `npm test` · `npm run typecheck` · `npm run lint` · `npm run build && npm start`.
Database integration tests run when `TEST_DATABASE_URL` points to a disposable database whose name contains `test`
(schema pushed with `DATABASE_URL=$TEST_DATABASE_URL npx prisma db push`).

### Default templates (what each new costing starts with)

`npm run db:seed` builds the default headers/rows of each mode from the reference workbooks in `data/reference/` (structure only).
Afterwards the templates belong to you: **Templates** page → *Edit structure* (add/rename/remove rows and headers, default UOM and GST) or
*Rebuild from a reference workbook* (`npm run template -- actual|client file.xlsx`). Changing a template affects new costings only.

## Standalone simulator (no install, no database)

`npm run simulator:build` produces `dist-simulator/simulator.html`: one self-contained page that runs the **same** calculation engine,
CAD reader (pdf.js), Excel and PDF exporters in a browser. Create several styles, upload each CAD PDF, enter costing values, apply CAD,
remove headers, compare Actual vs Client and export Excel / PDF. Entries are kept in the browser only (no server, no database).
It is a trial tool, not the multi-user system (no shared data, versions live in the browser).

## Using it (workflow)

1. **Customer / Brand** (masters; empty until you add them).
2. **Style number.** Existing styles open directly; anything uncertain says *“Possible match found — please confirm”*; unknown numbers can be created.
3. **Style image** and **CAD PDF** upload (drag & drop). The CAD parser fills *CAD DATA*; doubtful values are marked **VERIFY** and are editable/confirmable.
4. **Category** (Core & Ultimate / Fashion / High Fashion) sets the client Overhead+Margin rate.
5. **Costing mode** Actual ⇄ Client. Each opens with all its rows. Enter quantities, rates, GST, UOM; add components or headers; remove headers/rows
   this style does not need (restorable); *Apply CAD to costing* feeds consumption. *Save as v1* / *Save version*; *Export* PDF / Excel (live formulas).
6. **Comparison** tab: Actual vs Client of the same style, group by group, updating as values are entered.

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
  services/              templates, costing (versions + audit), CAD, style, rules, export (PDF/Excel)
  app/                   Next.js routes + thin API handlers
  features/              UI modules: costing, cad, styles, comparison, masters, templates
  components/            UI primitives
prisma/schema.prisma     PostgreSQL schema
data/reference/          the two reference workbooks (structure source + engine verification fixtures)
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
each starts from its own default template (all headers/rows, no values).
`compareCostings()` maps lines of both into comparison groups through **editable rules** (Masters → Costing Rules) and lists unmapped lines.

### CAD extraction
`cadParser.ts` is label based, not coordinate based: header text lines → (label → value) segments using a synonym table (`LABELS`) →
unit conversion → confidence → cross-checks (Length ÷ Sets vs Length per Set, pieces totals, size breakdown, drawing style tags, Total Length plausibility).
Anything doubtful is `requiresVerification`; nothing is guessed; PDFs without a text layer produce empty, flagged fields.
CAD → costing is configured by `CadMappingRule`s: client *Main Fabric* quantity (per-garment consumption) and actual *CONSUMPTION* (B7). Actual fabric-order quantity (lot metres) is never overwritten.

### Provenance, overrides, audit
Every field can carry `Provenance {origin, ref, original}`. Editing a template-default/CAD value records `OVERRIDE` and **keeps the original**
(`[CAD] 0.77 m → [Override] 0.80 m`, revertible). Versions store the document, engine output, engine version, changed fields, note, user and time;
`AuditEvent` is append-only (template builds, saves, CAD edits, mapping changes, exports).

### Database
PostgreSQL via Prisma 7 (`prisma/schema.prisma`): masters (`Customer, Brand, Category, Style, StyleAlias, Uom, CostSection, CostItem, FabricMaster, RateMaster, CostingRule`),
files (`StoredFile`, `CadExtraction` revisions), costings (`Costing`, `CostingVersion` JSONB snapshots with indexed totals, `CostTemplate` default structure per mode) and `AuditEvent`.
Uploads go through a `FileStore` interface (local disk now, swap for S3/GCS).

## Known limitations & ambiguities

* **No authentication**: the acting user is a name sent as `x-user` and recorded on versions/audit; add real auth before multi-user use.
* **No customers/brands exist in the reference files**, so none are seeded; style → customer mapping is manual.
* **Default rows are the union of what the reference workbooks contain** (e.g. Actual: Fabric 1-3 plus every add-on row seen, CMT / CMT KURTA / CMT BOTTOM, 16 trims). Trim them once in *Templates*; remove the rest per style.
* **CAD “Total Length 152.54 m”** in the sample is ≈ the 3.87 m marker in *inches* (39.4×); extracted as printed and flagged. The sample CAD contains only `FRONT BLOCK CUT 2`, so Length per Set may not be full-garment consumption (flagged).
* **Client “FINANCE COST 3%”** label vs formula `=L43*0`: the applied factor is an explicit input (default 0); the label is a reference. `FINAL PO = FOB − finance cost` is kept as in the source. Garment Rejection %, Testing, transport etc. are entered per style (no defaults).
* The reference actual sheets contain formula quirks (next-row references in `E12/E13`, shifted rejection formulas, `D41 + D50` in 2 sheets, …). The engine uses the canonical `qty × rate`; all 28 reference sheets reproduce the workbook's cached values (verification tests).
* Comparison grouping (which actual lines compare with which client category) is an interpretation; configurable (Masters → Costing Rules).
* Fabric / Rate masters start empty (they are user-maintained); nothing is auto-priced.
* CAD parsing needs a PDF text layer; layouts with unfamiliar labels need a synonym added to `LABELS`.

## Tests

`npm test` – 59 tests: engine verification against all 28 reference sheets (recomputed values equal the workbook's cached values), client chain (line-by-line L/M/O),
GST, finance/transport/final PO, CAD extraction (supplied PDF + alternative layouts + no-text-layer), style matching, validation, overrides,
CAD → costing mapping, comparison reconciliation, templates, version diffs, and (with `TEST_DATABASE_URL`) DB templates/versioning/audit/CAD revisions.
