# 11 — Gotchas and working agreements

How the work has been done on this project, the traps that cost time, and the mistakes already made once. Following these keeps the project consistent with its history.

## A. Working agreements

**With the business owner**
* They are a costing/commercial person, not a developer. Explain in plain language: what changed, what to look at, what you need from them. Use tables for numbers and ₹ with Indian grouping where it helps.
* When they say a result is wrong, **investigate against the data before defending or changing anything** — they have been right (the "only 5008" claim, the empty standard rates, the brand name).
* Ask when ambiguous; never invent a rule, rate, default, mapping or meaning. Put the ambiguity and the evidence in the question (see the open questions in `07_…` §3).
* Report outcomes faithfully: what you ran, what passed, what you did **not** check. Say so when a check could not be done (e.g. "Docker was unavailable, so the compose file was not run").
* Deliver the rebuilt `cost-engine.html` after every user-visible change and say that it replaces the previous file. Their saved data files still open.
* Do not create a pull request or push to a shared branch unless asked. Confirm before anything destructive or hard to reverse (force-push, deleting data, dropping databases that are not yours).

**In the code**
* Match the surrounding code: naming, comment density, idiom. Comments explain *why* (source-sheet facts, business reasons), not what.
* All business calculation lives in `src/lib/calculations` (pure, no React/Prisma/Excel imports). UI and services call it; they never contain formulas.
* Every field write that must carry provenance goes through `setLineField`. Never mutate a `CostingDoc` in place; return new objects. Never overwrite a saved version.
* Keep the service layer inside the Prisma subset that `standalone/memdb.ts` supports; run `npm run test:standalone` after touching queries.
* Source terminology stays (e.g. the `CONSUPMTION` label, `LD CHARGES`, `Garment Rejection`).
* Nothing prices a costing automatically. Anything derived from standards is opt-in, visible, reversible, and marked `MASTER`.
* After a change: `npm run typecheck && npm run lint && npm test && npm run test:standalone`; for UI/behaviour changes also `npm run standalone:build && npm run smoke:standalone`, and look at the result in a real browser. Update README/doc statements and test counts. Commit with a message that says what and why.
* Bump `STANDARD_VERSION` when standard-rate names/values change (see `04_…` §9).

## B. Technical gotchas

* **Next.js 16 is not the Next.js you know.** `AGENTS.md` says: read `node_modules/next/dist/docs/` before writing Next code (async `params`, route-handler signatures, config). Heed deprecations.
* **`src/generated/prisma` is git-ignored.** After `npm install` (postinstall) or any schema change: `npx prisma generate`, `node standalone/gen-meta.mjs`, `node standalone/gen-routes.mjs`. Forgetting `gen-meta` makes the single file ignore your schema change.
* **PostgreSQL may stop between sessions** in a container; "database tests fail" usually means restart it. Database tests **TRUNCATE** — they refuse a database name without `test`.
* **`prisma db push` data-loss prompt:** use a fresh database rather than forcing.
* **Hash router in the single file:** navigating from `#/?style=a` to `#/?style=b` (hash change only) does not remount the page. In scripts go to `#/styles` first. `window.confirm` is used (leave guard, open data file): automated browsers must accept dialogs.
* **Style numbers are text** (`0556`, `0557`); never coerce to numbers. Sheet names equal style numbers; titles can be wrong (use the sheet name).
* **Typed sums in the sheets** (`=4065+1617`) and **rates typed in the wrong column** (`D` instead of `C`) are real; the parsers handle them and the UI's number cells accept expressions.
* **exceljs quirks:** a formula cell whose result is exactly 0 comes back without `result`; treat missing as 0 when comparing (`scripts/verify-export-recalc.ts` does).
* **pdf.js in browsers:** needs the `Map/WeakMap.getOrInsert(Computed)` polyfill and a fake worker (`standalone/polyfills.ts`); the build aliases `pdfjs-dist/legacy/build/pdf.mjs` to the minified build.
* **pdfkit in the browser** needs the TTF passed as `font` (bundled DejaVu); Node reads it from `assets/fonts`.
* **Fonts/CSS in the single file:** Inter woff2 files are inlined as base64 by `standalone/build.mjs`; a regex does it — if `@fontsource/inter` changes its file naming the build warns "CSS still references files".
* **Excel metadata:** the reference workbooks carry author names and a machine path in `docProps/core.xml` and `xl/workbook.xml`; strip them before sharing (done for this package).
* **IndexedDB** can be cleared by the browser; the data file is the real backup. Autosave is debounced 700 ms and flushed on `pagehide`.
* **Do not `pkill -f <pattern>`** in a tool call whose own command line contains the pattern — it kills your shell. Kill by PID. Servers started for a test must be stopped by the test's owner.
* **Heavy parallel work is slow on 4 CPUs** (several Next servers, Chromium, LibreOffice).
* **`Handoff Package/`** (if this package sits inside the repository) is excluded from `tsc` and `eslint`; `vitest` only scans the root `tests/`.

## C. Mistakes already made — don't repeat them

1. **Treating the reference workbooks as data to import and display** (Stage 1–2). The engine replaces the Excel.
2. **Claiming "style 5008 is the only style with both costings"** without checking all files. Check coverage across *all* style numbers before asserting a negative.
3. **Naming a brand family before it was confirmed.** The KRTS family was labelled "KRTS (GET/YET)" because no file named the brand, and flagged as unconfirmed; the business owner later confirmed Live Smart and the labels had to be changed everywhere (analysis, masters, benchmarks, docs). When a name matters, ask first.
4. **Hiding rows by default in the Standard-rates dialog** and wording the empty state as "each already has a rate" — it misled the business owner. Show everything that matches; explain an empty result precisely.
5. **Marking a fresh untouched template draft as "unsaved"** (the first version of the leave guard fired on it). Count only entered values.
6. **A verification that skips missing values is vacuous.** When comparing computed vs cached values, count how many comparisons were real (the export checker prints "N with a non-zero value").
7. **Assuming saved browser data matches the newest seed.** Old autosaves/data files predate new seed rows; use `ensure`-style loading with a version tag.
8. **A very large multi-agent review was started and cancelled before it produced any finding.** If you repeat it, scope it to the unreviewed areas in `09_…` §4, agree cost and time first, and give each reviewer its own databases/ports/scratch folder and a rule to stop only processes it started.
9. **Applying a landed fabric rate to a purchase row** (double-counting finishing) — never auto-price fabric rows.
10. **Using `pkill` patterns that match your own command** (twice).

## D. Ready-made checks when something looks wrong

* A total differs from a sheet → `npm run verify:workbooks -- <that workbook>`; then read the sheet's formulas (openpyxl, formula mode) and `03_…` §3–5; check for typed sums, wrong-column rates, GST base.
* A CAD value looks wrong → compare `pdftotext` output with the parser's fields; remember `Total Length` is inches.
* The single file behaves differently from the server version → run `npm run test:standalone`; look for a Prisma query shape `memdb.ts` does not support (it throws).
* The Excel export looks wrong → `npm run verify:export` (needs LibreOffice) and open the file.
* Standards look stale → refresh the analysis snapshot and bump `STANDARD_VERSION`.
