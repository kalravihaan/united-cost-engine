# 08 — Runbook: run, test, build, extend, troubleshoot

All commands run from `project-source/` unless stated. Commands were verified on Linux with Node 22, PostgreSQL 16 and Chromium (Playwright).

## 1. Just use the product (no install)

Open `deliverables/cost-engine.html` in Chrome / Edge / Firefox (tested in Chromium). It contains the whole application and its database; it never contacts a server.

* Work is **autosaved in the browser** (IndexedDB). Treat the **data file** as the real copy: bottom-left bar → **Save data file** (`.ucedata`), **Open data file** (replaces what is in the browser), **Start empty** (restores default templates, erases data).
* First run contains: three default templates (Actual, Client GET, Client YOUSTA), the editable rules, five categories (Core & Ultimate 8 %, Fashion 10 %, High Fashion 12 %, Core and table products 8 %, Fast Fashion 12 %), the UOMs, and the standard rates (7 fabric types, 42 rates). **No** customers, brands, styles or costings.
* A guided first session: Masters → add a customer and a brand (e.g. *Live Smart*, client layout "Live Smart (GET layout)") → Cost Engine → type a style number → *Create style* → upload its CAD PDF (`reference-data/cad-markers/…`) → *Actual costing*: enter order/dispatch pieces and sale rate, values → *Apply CAD to costing* → *Standard rates* → *Benchmarks* → *Save as v1* → *Client costing* → *Comparison* → *Export* → *Styles* → delete a test style.

## 2. Run the full application (Next.js + PostgreSQL)

Requirements: Node 22, PostgreSQL 14+ (16 tested).

```bash
npm install                         # also runs postinstall: prisma generate, gen-meta, gen-routes
cp .env.example .env                # edit DATABASE_URL; STORAGE_DIR (uploads); DEFAULT_USER (name recorded until auth exists)
npm run db:push                     # create the schema
npm run db:seed                     # default templates + rules + categories + UOMs + standard rates (no styles, no costings)
npm run dev                         # http://localhost:3000
# production: npm run build && npm start
```

PostgreSQL without Docker: install it locally, `createdb united_cost_engine`, put the connection string in `.env`. With Docker: `docker compose up -d` (the compose file is provided but was never run in the original environment — Docker was unavailable there).
`npm run setup:local` = `db:push` + `db:seed`.

## 3. Checks (run these before and after every change)

| Command | Expected |
|---|---|
| `npm run typecheck` | no output |
| `npm run lint` | no output (the `Handoff Package/` folder, if present at the repo root, is ignored) |
| `npm test` | **96 passed, 8 skipped** without a database; **104 passed** with `TEST_DATABASE_URL` set |
| `npm run test:standalone` | 8 passed (the database integration tests against the in-browser store; needs no database) |
| `npm run verify:workbooks [dir…]` | `0 differences`; default folder `data/reference`; pass `../reference-data` for all files (protected files are reported as unreadable) |
| `npm run verify:export` (needs LibreOffice: `soffice`) | `0 differences` on all six exported workbooks (387 live formulas) |
| `npm run standalone:build` then `npm run smoke:standalone` | build prints the three template row counts (55 / 34 / 45) and `standard rates: …added 42`; smoke test **13/13 checks passed** |

Database tests: create a disposable database whose name **contains `test`** (the suite refuses otherwise because it **TRUNCATES tables**), push the schema into it and run:

```bash
createdb united_cost_engine_test
DATABASE_URL=postgresql://USER@HOST/united_cost_engine_test npx prisma db push
TEST_DATABASE_URL=postgresql://USER@HOST/united_cost_engine_test npm test
```

`smoke:standalone` needs a Chromium: pass its path as the second argument or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`; `playwright-core` is a dev dependency (browsers are not downloaded by it — install one, e.g. `npx playwright install chromium`, or use any local Chrome/Chromium).

## 4. Rebuild the single HTML file

```bash
npm run standalone:build      # → dist-standalone/cost-engine.html  (~6.5 MB)
npm run smoke:standalone      # real-browser check of the main flow (13 checks)
```
The build regenerates `standalone/gen/` (schema metadata, route table, first-run seed). It is reproducible: building the packaged source gives a file of the same size with identical application code (only the generated ids and `savedAt` timestamp in the embedded first-run seed differ). **Ship the rebuilt file and tell the business owner it replaces the old one** (their data files still open; new template rows apply only to costings started afterwards).

## 5. Common tasks

**Edit a default template** — in the app: *Templates* → edit structure. From files: `npm run template -- actual a.xlsx [b.xlsx …]` (union of several actual workbooks) or `npm run template -- client file.xlsx [FORMAT_KEY ["Layout name"]] [--also more.xlsx]`. Changes affect new costings only.

**Add a customer's client layout** — *Templates → Add a client costing layout*: give it a name and drop one of the customer's sheets; assign it under *Masters → Brands/Customers → Client costing layout*. If the sheet has unusual headers, extend the header regexes in `src/lib/parsers/clientCostingParser.ts`; if the export needs a different sheet (like YOUSTA's `excel update`), see `ClientFormat.export` and `src/lib/export/documents.ts`.

**Support a new CAD layout** — add the label synonym to `LABELS` in `src/lib/cad/cadParser.ts` and a test with the PDF.

**Refresh the analysis** — `npx tsx scripts/extract-costing-data.ts <folder of workbooks and CADs> data.json`, `python3 scripts/analysis/build_cost_analysis.py data.json cost_analysis.xlsx` (needs pandas, openpyxl), copy `cost_analysis.tables.json` to `src/data/analysisSnapshot.json`, **bump `STANDARD_VERSION`** in `src/lib/analysis/standardRates.ts` if names or values of standards changed (so older databases/data files reload them), run tests, rebuild. Analysis inputs from the original run are in `deliverables/analysis/extracted-costing-data.json`.

**Change the database schema** — edit `prisma/schema.prisma` → `npx prisma generate` → `node standalone/gen-meta.mjs` (so the in-browser store knows the change) → `npx prisma db push` on dev/test databases → add tests → `npm run test:standalone`. Existing saved `.ucedata` files carry the old shape: check `memdb.restore` tolerates missing tables/fields (it fills defaults from the metadata) before shipping.

**Add an API route** — add `src/app/api/<path>/route.ts` with the `handle(...)` wrapper; `gen-routes.mjs` picks it up for the single file automatically. Keep all Prisma calls inside the subset `memdb.ts` supports (no `_count`/aggregates/raw SQL); confirm with `npm run test:standalone`.

**Verify the engine on new workbooks** — drop them in a folder and `npm run verify:workbooks -- <folder>`; encrypted files are listed as unreadable.

**Data-file format** — `.ucedata` = gzip of JSON `{ format: "uce-data", version: 1, savedAt, db: { Table: rows[] }, blobs: { storagePath: base64 } }` (`standalone/persist.ts`). Bump `version` on incompatible changes and keep opening older versions.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Cannot find module '@/generated/prisma'` / missing `src/generated` | it is git-ignored; run `npx prisma generate` (done by `npm install`'s postinstall) |
| Database tests fail with connection errors | PostgreSQL stopped (it can stop between sessions in a container); restart it and re-run |
| Database tests refuse to run | `TEST_DATABASE_URL` must point at a database whose name contains `test` |
| `prisma db push` asks to accept data loss | it protects existing data; use a fresh database (or accept only on a disposable one) |
| Standalone build: "CSS still references files" / font warnings | the Inter font files come from `node_modules/@fontsource/inter`; reinstall |
| Single-file page blank, console error about `getOrInsertComputed` | the pdf.js build needs the polyfill in `standalone/polyfills.ts` (older browsers) |
| Navigating only the hash (`#/styles` → `#/?style=…`) does not remount in a script | go to `#/styles` first, then to the target hash (used in the smoke test) |
| In an automated browser, `window.confirm` blocks | accept dialogs (`page.on("dialog", d => d.accept())`) |
| "Standard rates" masters empty in an old browser profile | open the Standard rates dialog or the Fabric/Rate masters tab: they auto-load when absent |
| Excel export formulas show cached numbers only | open in Excel/LibreOffice (they recalc); the formulas are live |
| A tool kills your shell | never `pkill -f` a pattern that also matches your own command line; kill by PID |

## 7. Environment notes from development

Linux container, 4 CPUs, 15 GB RAM; PostgreSQL 16 local; Chromium via Playwright; LibreOffice headless used to recalculate exported workbooks; `pdftotext` to compare CAD text; Python 3 with pandas/openpyxl for analysis. Heavy parallel work (several servers/browsers/LibreOffice at once) is slow on 4 CPUs.

## 8. Hosting on GitHub (optional — the new operator's choice)

* **The single HTML file can be hosted on GitHub Pages** (or any static host: Netlify, Cloudflare Pages, an office web server). It is a static file with no server calls, no outside requests and no service worker. Checked: served over `http://` under a sub-path (as GitHub Pages serves a project site), it loads, seeds the 42 standard rates, keeps data across a reload (IndexedDB) and makes zero requests to any other host. Not tested on GitHub's own servers (no access from the original environment).
* **The full server version (Next.js + PostgreSQL) cannot run on GitHub Pages** — it needs a Node host and a database (see R-07 in `06_…`). GitHub can store its code, but not run it.
* How, in outline: put `deliverables/cost-engine.html` in a repository as `index.html` (e.g. in a `docs/` folder or a `gh-pages` branch) and enable *Settings → Pages* for that folder/branch; the site appears at `https://<account>.github.io/<repository>/`. A GitHub Actions workflow can rebuild it (`npm ci && npm run standalone:build`) and publish `dist-standalone/cost-engine.html` on each push.
* Things to decide before publishing:
  1. **Visibility.** On most GitHub plans a Pages site is **public** even when the repository is private (private Pages needs GitHub Enterprise Cloud). The HTML contains the standard rates, margins and benchmark tables derived from the business's real costings — anyone with the link can read them. Publish only if that is acceptable, otherwise use an access-controlled host or keep distributing the file directly.
  2. **Data stays per browser.** Each visitor's work lives in *their* browser's storage for that web address (and in data files they save). Nothing is stored on GitHub and nothing is shared between people; changing the address (new domain/repository name) starts empty — use Save/Open data file to carry data across.
  3. **No login.** Anyone who opens the page can use it (on their own browser data only).
  4. **Updates.** Replacing the file replaces the app for everyone who reloads; their saved data keeps working (new template rows only apply to costings started afterwards).

