# 04 — Architecture

Authoritative detail is in the code (`project-source/`); this document is the map and the reasoning. Paths below are relative to `project-source/`.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node 22 | the full app only; the single-file build needs only a browser |
| Web framework | **Next.js 16.3.8** (App Router, route handlers, async `params`) | **This Next.js differs from older versions** — `AGENTS.md` instructs: read `node_modules/next/dist/docs/` before writing Next code |
| UI | React 19.2, Tailwind CSS 4 (`@tailwindcss/postcss`), Radix primitives, cmdk, lucide-react, Inter font | in-house primitives in `src/components/ui` (shadcn-like, not the shadcn CLI) |
| Language | TypeScript 5 (strict) | |
| Database | **PostgreSQL 16** via **Prisma 7.10** with `@prisma/adapter-pg`; client generated to `src/generated/prisma` (git-ignored, created by `postinstall`) | |
| Excel | `exceljs` (read and write) | |
| PDF out | `pdfkit` (browser build is given the bundled DejaVu TTFs as `font`) | fonts in `assets/fonts` |
| PDF in (CAD) | `pdfjs-dist` 6 (text with positions) | browser build needs a `Map/WeakMap.getOrInsert(Computed)` polyfill + a fake worker (`standalone/polyfills.ts`) |
| Images | `@napi-rs/canvas` (server) / browser canvas (single file) | downscale photos, render CAD preview |
| Validation | `zod` 4 | API schema |
| Tests | `vitest` 5; Playwright-core (smoke test only) | |
| Single-file build | `esbuild` + `postcss` | `standalone/build.mjs` |
| Analysis | Python 3 + pandas + openpyxl | `scripts/analysis/build_cost_analysis.py` |

No paid service, no outside network call, no AI service inside the product (CAD reading is rule-based text extraction).

## 2. Repository map (`project-source/`)

```
src/types/                  normalized schema (costing.ts, rules.ts) – no framework imports
src/lib/
  calculations/             THE engine – pure functions: actual.ts client.ts comparison.ts grouping.ts overrides.ts
                            cadMapping.ts template.ts sections.ts diff.ts explain.ts expression.ts common.ts
  parsers/                  workbook.ts actualCostingParser.ts clientCostingParser.ts templateBuilder.ts
  cad/                      pdfText.ts cadParser.ts preview.ts
  normalization/            labels.ts styleMatching.ts
  validation/               validate.ts schema.ts
  export/documents.ts       Excel + PDF generation (runtime-agnostic)
  analysis/                 snapshot.ts benchmarks.ts standardRates.ts applyStandards.ts
  format.ts
src/data/                   defaultRules.ts masterConfig.ts analysisSnapshot.json
src/server/                 db.ts fileStore.ts http.ts user.ts repositories/*   (only code that touches the DB)
src/services/               costingService templateService cadService styleService rulesService standardRatesService exportService
src/app/                    Next pages and API route handlers (thin)
src/features/               UI modules: costing styles cad comparison masters templates analysis
src/components/             app-shell, ui primitives
prisma/schema.prisma        the PostgreSQL schema
scripts/                    seed.ts rebuild-template.ts extract-costing-data.ts analysis/ smoke-standalone.mjs verify-against-workbooks.ts
standalone/                 the single-file build (see §8)
simulator/                  an earlier, smaller browser build (superseded, see 06)
tests/                      vitest suites + fixtures
data/reference/             the five reference workbooks (structure source + test fixtures)
docs/                       DATA_MODEL.md REAL_SCOPE.md COST_ANALYSIS.md
```

Layering rules (enforced by structure and review): the engine imports nothing from React/Prisma/Excel; UI calls engine functions but holds no formulas; repositories are the only DB access; customer/brand mapping lives on `Style` and the engine never reads it; services orchestrate; API route handlers are thin.

## 3. Data model (PostgreSQL; `prisma/schema.prisma`)

* **Masters:** `Customer`, `Brand`, `Category` (Overhead+Margin tiers), `ClientFormat` (client layout: key + label), `Style` (`number` unique, text), `StyleAlias` (user-confirmed alternative names), `Uom`, `CostSection`, `CostItem`, `FabricMaster`, `RateMaster`, `CostingRule` (JSON rules: comparison grouping `GROUP` and `CAD_MAPPING`).
  `Customer`/`Brand` carry `clientFormatId`; a style resolves its layout: brand → customer → default (`getWorkspace` returns `style.clientFormat`, null when nothing is assigned).
* **Files:** `StoredFile` (kind `STYLE_IMAGE`/`CAD_PDF`/`CAD_PREVIEW`/`SOURCE_WORKBOOK`, sha256, `storagePath`, `styleId`), `CadExtraction` (immutable revisions: extracted `data` JSON with manual edits layered on top).
* **Costings:** `Costing` (unique per `(styleId, type)` — one Actual and one Client per style), `CostingVersion` (immutable: `doc` JSON, `result` JSON, `engineVersion`, indexed `totalCost/costPerPc/finalPoPrice`, `changedFields`, note, user, time), `CostTemplate` (default structure per `(costingType, formatKey)`, versioned).
* **Audit:** `AuditEvent` (append-only; template builds, saves, CAD uploads/edits, mapping changes, exports, deletes, standard-rate loads). Deleting a style detaches its earlier events (`styleId` null, `details.styleNumber` added) and adds `STYLE_DELETE`.
* **Normalized document (TypeScript, `src/types/costing.ts`):** `CostingDoc = ActualCosting | ClientCosting`.
  * `CostLine { id, sectionKey, sectionLabel, item, description, itemType, quantity, uom, rate, gstRate, currency, calc, amount?, attributes, prov, sourceFormula?, sourceRef?, removed?, custom? }`
  * `calc` = `QTY_X_RATE` | `PERCENT_OF_SUBTOTAL` (rate is a fraction of Total) | `ENTERED_AMOUNT` (single typed amount, e.g. YOUSTA CM, LD charges).
  * `prov` is per field (`quantity`, `rate`, …): `Provenance { origin, ref, original, reason, at, by }`; origins `IMPORT | CAD | MANUAL | OVERRIDE | DERIVED | TEMPLATE | MASTER | DEFAULT`. Replacing a CAD/template/master/import value records `original`; typed values by a person are `MANUAL`/`OVERRIDE` and are never replaced by automatic features.
  * `ActualParams { orderPcs, dispatchPcs, consumption {value, formula}, deduction, profitPctAddsValueLossPct, notes, removedSections }`.
  * `ClientParams { sections[{key,label,phase MAIN|POST_TOTAL,removed}], category, finance, transport, headerNotes, format {key,label,export{sheetName,headers,updateSheet}}, pricing {finalPriceLabel, finance, transport, msme{rate,financeLabel,priceLabel}} }`.
  * Section/row removal is per style, flagged `removed`, excluded from totals, restorable; nothing is deleted from history.

## 4. Calculation engine (`src/lib/calculations`)

* `calculateActualCost(doc)` and `calculateClientCost(doc)` are pure; `calculateCosting(doc)` dispatches by type. Both reproduce the workbook chains in `03_…` and return a result with line totals, section totals and the headline numbers.
* `compareCostings(actual, actualResult, client, clientResult, rules)` — per-piece basis: actual purchase value ÷ dispatch pieces vs client **base (w/o GST)** per piece; value loss excluded; lines mapped to comparison groups by the editable `GROUP` rules (first match wins; unmapped lines are listed, never hidden).
* `overrides.ts` — `setLineField(doc, lineId, field, value, ctx, origin, ref)` is the single write path that maintains provenance: non-user origins write and keep the replaced value as `original`; user edits become `MANUAL`/`OVERRIDE`; reverting to the original clears the override.
* `cadMapping.ts` — `applyCadToCosting(doc, cad, rules)` writes CAD length-per-set into client Main Fabric quantity and Actual consumption (provenance CAD), skips fields that need verification.
* `template.ts` / `sections.ts` — create a costing from a template (STRUCTURE = rows without values), add/remove/restore lines and headers.
* `expression.ts` — safe arithmetic evaluator for typed sums (`+ - * / ( )`, Indian digit grouping); rejects anything else; keeps 12 significant digits.
* `diff.ts` (changed fields between versions), `explain.ts` (the Calculation tab: formula chain with source formula text).

## 5. Import side (reference workbooks → structure only)

* `parsers/actualCostingParser.ts` reads an actual workbook (all sheets) into normalized docs **plus the workbook's cached totals** (`cached`), used only to verify the engine. Handles the quirks listed in `03_…` §3 and reports issues (`NON_NUMERIC_INPUT`, `RATE_IN_COLUMN_D`, `TITLE_MISMATCH`, typed sums…).
* `parsers/clientCostingParser.ts` reads a client sheet in either layout (header regexes per layout, categories, GST, percent rows, CM amount row, price chain, MSME, category tier table, header notes, vendor block, `excel update` sheet) and records the layout's `export` metadata.
* `parsers/templateBuilder.ts` builds the **default templates**: `buildActualTemplate(inputs[])` unions the rows of several actual workbooks (canonicalising spellings such as "frieght"/"freight", one row per add-on kind); `buildClientTemplate(sheet, fileName, format, extras)` learns a layout (rows, headers, UOM/GST defaults, fixed percentages as TEMPLATE defaults).
* `services/templateService.ts` stores templates, builds them from reference files (`rebuildTemplateFromReference`) and versions edits. Editing a template affects **new** costings only.

## 6. CAD extraction (`src/lib/cad`)

`pdfText.ts` gets positioned text from pdf.js; `cadParser.ts` is **label-based, not coordinate-based**: header lines → `label → value` segments via a synonym table (`LABELS`) → unit conversion → confidence → cross-checks (Length ÷ Sets vs Length per Set, piece totals vs size breakdown, drawing style tags, plausibility of Total Length). Every field is `CadField {value, raw, confidence, requiresVerification, manual?}`; a person's edit is stored as `manual` in a **new immutable revision** and the extracted value is never discarded. Non-PDF files are rejected; a PDF without a text layer yields empty flagged fields. A second PDF uploaded to the same style is stored as another extraction; **the latest is the one used** (one CAD per style).

## 7. Export (`src/lib/export/documents.ts`)

`exportExcel(input)` / `exportPdf(input, fonts)` take a document plus style/customer/brand/category/version, optional CAD summary and image, and the other-mode costing for the comparison section. Excel contains **live formulas** (recalculated identically in LibreOffice), the customer's own sheet name/wording per layout, vendor/brand block, CM amount row, final-price rows, and for YOUSTA the `excel update` sheet linked by formulas. PDF mirrors the layout's price chain. Server wrappers read the fonts from disk (`services/exportService.ts`); the single-file build swaps in a browser version (`standalone/shims/exportService.ts`).

## 8. The single-file build (`standalone/`)

Goal: the **same application** as one HTML file, no server. How:

* `gen-meta.mjs` reads `prisma/schema.prisma` and writes `standalone/gen/schemaMeta.json` (models, fields, defaults, uniques, relations, cascades).
* `memdb.ts` is a **generic in-memory, Prisma-compatible store** driven by that metadata: `findUnique/findFirst/findMany/count/create/createMany/update/updateMany/upsert/delete/deleteMany`, `where` with equals/in/notIn/not/contains/startsWith/endsWith/gt/gte/lt/lte/mode/OR/AND/NOT and compound unique keys, `include/select`, `orderBy`, `take/skip`, `$transaction` with rollback, unique and foreign-key checks, `onDelete: Cascade`, cuid/now/updatedAt defaults, Json round-trip, a change hook for autosave, `snapshot()/restore()`. **Not supported:** `_count`, aggregations, raw SQL; unsupported shapes throw. The service layer must stay inside the supported subset — `npm run test:standalone` runs the database integration tests against it.
* `gen-routes.mjs` scans `src/app/api/**/route.ts` and writes the route table; `runtime.ts` installs a **`window.fetch` shim** so `/api/*` calls the real route handlers (and rewrites `/api/files/<id>` to `blob:` URLs).
* `shims/` replace `src/server/db.ts` (→ memdb), `fileStore.ts` (→ in-memory blobs), `services/exportService.ts` and `lib/cad/preview.ts` (browser canvas), `next/link`, `next/navigation` (hash router: `#/styles`, `#/?style=…&mode=ACTUAL`), `next/server`.
* `make-seed.ts` runs the real services once on the in-memory store to produce the first-run data (`gen/seed.json`: rules, the three default templates, categories, standard rates); `entry.tsx` mounts the app (`AppShell` + a router over the same page components) and `DataBar.tsx` adds Save/Open data file and Start empty.
* `persist.ts`: browser autosave in **IndexedDB** (debounced 700 ms, flushed on `pagehide`/tab hidden) and the `.ucedata` data file (gzip JSON `{format:"uce-data", version:1, db, blobs}`); opening a file validates the format/version and replaces everything.
* `build.mjs`: gen-meta → gen-routes → bundle and run `make-seed` → Tailwind CSS with Inter fonts inlined as base64 → esbuild the app (alias `pdfjs-dist` legacy → the minified build, inject Buffer shim, define `process.env.*`) → inline CSS and JS into `page.html` → `dist-standalone/cost-engine.html` (~6.5 MB). The build is reproducible: rebuilding the packaged source gives a file of the same size with identical application code; only the embedded first-run seed differs (generated ids and a `savedAt` timestamp).
* Limits: one person, no login, data lives in that browser unless the data file is carried around; tested in Chromium only.

## 9. Analysis, benchmarks, standard rates

* `scripts/extract-costing-data.ts` flattens every workbook (and CAD markers, and the list of encrypted files) into JSON; `scripts/analysis/build_cost_analysis.py` builds `cost_analysis.xlsx` (26 sheets) and `*.tables.json`; the tables are copied to `src/data/analysisSnapshot.json` which the app embeds. Refresh steps: `docs/COST_ANALYSIS.md` (last section).
* **Benchmarks tab** (`lib/analysis/benchmarks.ts`): classifies the style (`segmentFor(styleNumber, assignedLayout, brand)`: YOUSTA / Live Smart 5xxx (CUT) / Live Smart 4xxx/6xxx (FUT)), garment cluster (kurta/top < 2.2 m vs set/long ≥ 2.2 m), embellished or plain, fabric type (from the fabric row's name); measures cost/pc, fabric/pc, embellishment/pc, CMT/pc, landed fabric rate, consumption cell, purchase allowance, sale rate, profit % with low/typical/high from the snapshot. Read-only.
* **Standard rates** (`lib/analysis/standardRates.ts`, `services/standardRatesService.ts`, `POST /api/standard-rates`): converts snapshot tables to Fabric master rows (landed rate by fabric type) and Rate master rows (embellishment kinds, trims by brand, CMT by segment/cluster). Rows carry `source` starting `Standard rates vN · …` (N = `STANDARD_VERSION`, bumped when names/values change); loading replaces only such rows, never user rows; `?ifMissing=1` loads only when the current version is absent (older databases/data files). Seeded on first run and loaded when the Masters tabs or the dialog open.
* **Apply standard rates to an Actual costing** (`applyStandards.ts`, `StandardRatesDialog.tsx`): plan = for each CMT row (`CMT`, `CMT KURTA`), trims row (by brand-suffixed master name) and add-on row of FABRIC ORDER (regex table `ADDON_KINDS`: tassel, lace/dori, neck&sleeve, yoke, palla, front, katha, couching, scallop, hand work, sleeve, neck, zipper, elastic, button, emb) the master rate; a user-added master with the same item name wins; **fabric rows are never matched** (the standard is a landed rate that already contains finishing); quantities untouched; rates a person typed or overrode are never replaced; applied rates are `MASTER` with the replaced value kept as `original`; the dialog lists quantity rows first and the user ticks what to apply.

## 10. API (all under `src/app/api`, JSON, `x-user` header = acting name)

`GET/POST /styles`, `GET/PATCH/DELETE /styles/[id]` (DELETE needs `?confirm=<style number>`), `/styles/match`, `/styles/[id]/{workspace,alias,cad,image,versions}`, `/costings` (POST = save a new version), `/costings/start` (legacy: start a costing by copying another style's structure or values; the UI no longer uses it), `/versions/[id]`, `/cost-templates[/type][/rebuild]` (`?format=`), `/templates`, `/masters/[name][/id]` (declarative masters from `src/data/masterConfig.ts`; list/create/update only — `DELETE` is refused with "Masters are deactivated, not deleted" except for alias mappings; some masters have an `active` flag, **Fabric and Rate masters do not**, so their rows can be edited but not removed), `/rules`, `/standard-rates`, `/export` (POST: Excel/PDF), `/files/[id]`, `/audit`.
Errors are uniform JSON `{error}`; validation errors → 400; unexpected → 500 with a generic message.

## 11. Configuration

`.env` (see `.env.example`): `DATABASE_URL`, `STORAGE_DIR` (uploads; swap `FileStore` for S3/GCS later), `DEFAULT_USER` (name recorded until authentication exists). `next.config.ts` keeps pdf.js, canvas, pdfkit, exceljs, pg and Prisma out of the server bundle and includes `assets/fonts` for the API.
