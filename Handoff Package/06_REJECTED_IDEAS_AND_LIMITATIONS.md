# 06 — Rejected ideas, superseded approaches and known limitations

Read this before proposing something: it may already have been tried, rejected or deliberately postponed. Each entry says **what**, **why it was dropped**, **what its limits are / what is left of it**, and **when to reconsider**. Features that were postponed (not rejected) are specified in `07_…`.

## Part A — Rejected or superseded

### R-01 · Import the reference workbooks as styles and costings, and display them
* **What:** the first build parsed the workbooks into the database (28 actual styles + the client style) and showed them as tables.
* **Why dropped:** it misunderstood the product. The engine **replaces** the Excel; the workbooks are reference only. Costing values must be entered in the engine; only the CAD and style image are uploaded.
* **Left of it:** the parsers survive, but they now serve three purposes only — learning **templates** (structure), **verifying** the engine against the workbooks' cached values, and **analysis**. Nothing from the workbooks is stored as a style or costing.
* **Reconsider if:** the business asks for a bulk migration of historical costings into the engine. That would be a new, explicit feature (import as `IMPORT` provenance versions) and must not reuse the old behaviour silently.

### R-02 · Client costing derived from Actual (a markup) or one shared dataset
* **Why dropped:** forbidden by the specification and the owner: the two are different datasets with different particulars; the premium is data-driven. They have separate documents, engines and version histories.
* **Limit:** comparison needs a mapping between actual lines and client categories — an interpretation (editable rules), never an equality.

### R-03 · "Pairing" the actual of one style with the client of another in Comparison
* **What:** a temporary workaround when no style had both costings.
* **Why dropped:** it compared different garments. Comparison now uses Actual and Client of the same style only; it is empty until both exist.

### R-04 · A read-only clickable preview of imported data
* **Why dropped:** it showed the wrong concept (R-01). Superseded by an interactive build, then by the single file.

### R-05 · The browser "simulator" as the end product
* **What:** `simulator/` + `npm run simulator:build` → `dist-simulator/simulator.html`, a smaller one-page build of the engine with its own UI.
* **Why superseded:** it re-implements the screens, keeps versions only in the browser and has no masters/templates editor. The owner asked for the real application in one file → `standalone/`.
* **Limit / status:** the simulator code is **stale** (no Analysis, Benchmarks, standard rates, delete, leave guard). It is kept for reference; do not extend it. **Reconsider:** never — delete it if it is in the way.

### R-06 · Local install via Node + Docker as the way for the business to use it
* **Why dropped:** the business users cannot install developer tools. The single HTML file is the primary deliverable; the Node + PostgreSQL version remains for a future shared deployment.

### R-07 · Hosting it online now
* **Why not done:** a host (Node 22 + managed PostgreSQL + persistent file storage for uploads) and an account were not available, and **there is no authentication** — anyone with the link could read and edit costings.
* **Limit:** local-disk `FileStore` is lost on serverless platforms; swap for S3/GCS (the interface exists, the implementation does not).
* **Reconsider when:** several people must share live data. Prerequisites: authentication/roles, S3-style file store, managed PostgreSQL, backups.

### R-08 · Opening the password-protected client workbooks by any workaround
* **Why refused:** not authorised; the right route is the owner supplying the passwords or unprotected copies (Excel: File → Info → Protect Workbook → clear the password → save a copy). The five files (`GETKRTSFUT6002_`, `6002_[1]`, `6098`, `6099`, `6100`) are in `reference-data/protected-unreadable/`. `6100` matters most (it also has an actual sheet and a CAD → a second complete pair).

### R-09 · Copying the sheets' formula anomalies into the engine
* **Why dropped:** they are errors in unused slots (next-row references, shifted formulas). The engine uses the canonical own-row `qty × rate`; the parser reports each anomaly. All readable sheets still reproduce the workbooks' cached values.

### R-10 · Applying the "FINANCE COST 3%" label as a rate
* **Why dropped:** the formula multiplies by **0**. Applying 3 % would change quoted prices. The factor is an explicit input (default = source value); the label is shown as a reference. YOUSTA's MSME 3 % is different: it is a documented price row.

### R-11 · A fixed 12 % Overhead+Margin for YOUSTA
* **Why dropped:** the YOUSTA sheets carry a category table (Core and table products 8 %, Fashion 10 %, Fast Fashion 12 %); the rate follows the category (one newer sheet, `2243`, uses 10 %).

### R-12 · Pre-filling every new style from the standards ("auto-pricing")
* **Why dropped:** the standards are medians of small samples (often under 10 sheets) and a silently priced costing violates "never invent a costing rule". Replaced by the opt-in **Standard rates** dialog (tick rows; reversible).
* **Limit:** applying standards fills rates only where a master row matches by name; unmatched rows (e.g. `size label`, `flag label`, `match it tag`, `rfid poly bag`, `hardtags`, `foil print`, `trims 6/7`) have no standard.

### R-13 · Applying the fabric standard rate to fabric rows
* **Why dropped:** the standard is a **landed** rate (purchase + finishing/printing, per metre bought) and depends on supplier and fabric; the Actual sheet has the finishing as its own row. Applying a landed rate to the purchase row double-counts finishing. Fabric rate comparison exists only in **Benchmarks**, and only when the fabric is named (e.g. "cotton slub").

### R-14 · Deducting value loss from profit; costing on received (not ordered) metres
* **Status:** **not changed** — the sheets do neither. Both are flagged in the analysis (value loss ₹2.51 lakh never deducted; 18 of 21 sheets with notes ordered more fabric than was received, ≈ ₹6.5 lakh). These are **business decisions**: ask before changing, because changing them changes every historical number.

### R-15 · Auto-assigning customers/brands from style numbers or product IDs
* **Why dropped:** the specification forbids inventing mappings. Assignment is manual. **Exception (guidance only):** Benchmarks infer a *segment* from the style-number shape and prefixes, never writing a brand.

### R-16 · Matching styles across files by colour or exact string
* **Why dropped:** the same garment is written differently per file (`72232`, `GETKRTSCUT5008 - BLACK`, `YAS26ZWEWYF72300`); colours disagree between the actual sheets and the YOUSTA summary (e.g. "Lilac" vs "WHITE"). Matching uses normalised style numbers with a **confidence** and asks for confirmation when uncertain; confirmed alternatives are stored as `StyleAlias`.

### R-17 · One CAD per style for ever
* **Status:** accepted **for now** (owner decision). Real styles need several markers (see `03_…` §6, `07_…`). Uploading a second PDF to a style stores it but **only the latest feeds the costing**; earlier extractions stay in the database.

### R-18 · Soft delete / archive of styles
* **What was built instead:** permanent delete with a typed confirmation and an impact list; the audit trail keeps earlier events and records the deletion; blobs are removed unless another record uses them.
* **Limit:** deleted costings cannot be restored (the single-file user should Save data file first).
* **Reconsider if:** the business wants recoverable deletes — add `archivedAt` to `Style` and filter lists.

### R-19 · Deleting Rate/Fabric master rows
* **Status:** **not possible** today: `DELETE /api/masters/…` is refused except for alias mappings, and `RateMaster`/`FabricMaster` have no `active` flag. A user can edit a row but not remove it. Add an `active` flag (schema change → regenerate Prisma client and `schemaMeta`) or allow delete for these two masters.

### R-20 · An embedded SQL engine for the single file
* **What happened:** a purpose-built, schema-driven in-memory store (`memdb.ts`) was written instead. The project record does not show that SQLite-in-WASM or similar was evaluated, so do not claim it was.
* **Limits:** a subset of Prisma (no `_count`, aggregates, raw SQL; unsupported shapes throw). **Rule:** any new query shape must be covered by `npm run test:standalone`. **Reconsider if:** the subset becomes a burden — then evaluate an embedded SQL engine behind the same `prisma` shim.

### R-21 · A 13-reviewer multi-agent review of the whole project
* **What happened:** launched, restarted once, then **cancelled before any reviewer finished**; no findings exist from it. Servers, databases and scratch files it created were cleaned up.
* **Instead:** a solo review (engine vs 780 workbook values, six exports recalculated in LibreOffice, evaluator probes, docs) that found and fixed three defects.
* **Not covered (still open):** API robustness under hostile/bad input; concurrent saves (two clients saving the same style at once — the `(costingId, versionNo)` uniqueness is the safety net but is untested); upload size/type abuse; hostile PDFs through pdf.js; XSS review; mutation testing of the suite; browsers other than Chromium. See `09_…`.

### R-22 · localStorage (or only IndexedDB) as the database
* **Why dropped:** the specification forbids it as the primary store. The single file uses IndexedDB **only as autosave** and treats the **data file** as the real copy.

### R-23 · Refreshing the analysis inside the app
* **Why dropped:** the analysis is produced by a Python pipeline outside the product; the app embeds a **static snapshot**. **Limit:** the Analysis page, Benchmarks and Standard rates go stale until someone re-runs the pipeline (`project-source/docs/COST_ANALYSIS.md`, last section) and rebuilds. **Reconsider if:** the business wants live standards computed from *saved* costings — a different, larger feature (aggregate saved versions).

### R-24 · Correcting wrong sheet titles or copied sheets automatically
* **Why dropped:** they are data errors for the owner to fix; the parser reports `TITLE_MISMATCH`, the analysis lists copied sheets (0557 = 0556; the 5009 colour sheets and 5008-fuchsia share production notes).

### R-25 · The legacy "start a costing from another style" route
* `POST /api/costings/start` (copy structure or values of another style) is still in the API but **unused by the UI** since the Stage 3 rework. Safe to delete.

## Part B — Known limitations of the product as handed over

**Platform**
* No authentication or authorisation; the acting user is a typed name (`x-user`). Do not expose the server version to the internet as it is.
* The single file serves **one person at a time**; data lives in that browser's IndexedDB and in data files the person saves. Browsers can clear site data (private windows, "clear data"); the data file is the real backup. Tested in **Chromium only** (not Firefox, Edge or Safari).
* The data file stores uploads (images, CAD PDFs) inside it, so it grows with uploads; autosave rewrites the whole snapshot (fine for hundreds of styles, **not load-tested** for thousands, despite the spec's wish).
* The Styles tab lists at most 500 styles (search filters across all); Masters lists up to 2,000 rows.
* PDF/Excel exports tested for the reference layouts; other customers need a learned layout (Templates → Add a client costing layout) and possibly export tweaks.

**Costing model**
* One Actual and one Client costing per style (`unique(styleId, type)`): **no colourways** (the workbooks have one actual sheet per colour).
* One CAD per style feeds consumption (the latest).
* Production figures (fabric received/used, cut, shipped, shortage, fent) are free-text notes, not fields; no variance warnings.
* YOUSTA upload sheet: `Total Qty` is blank (no PO quantity in the engine).
* No brand summary report (PO value, actual cost, margin by style).
* Rate and Fabric master rows cannot be deleted (R-19).
* Comparison grouping is an interpretation (editable).

**Data and analysis**
* Five protected client workbooks are unreadable (R-08).
* Standards come from small samples; many cells have fewer than 10 sheets; "plain FUT" has no sheets (compared with embellished FUT, and the row says so).
* Segment detection is inferred from style-number shape unless the brand/layout says otherwise.
* All `…KRTS…` styles are classified as Live Smart (confirm).
* `docs/DATA_MODEL.md` is the first-phase study (partly historical; a status note at its end says which parts).
* README test counts are maintained by hand.
