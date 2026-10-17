# START HERE — Cost Engine hand-over package

You are continuing an in-progress software project. Everything you need to understand it, run it and carry on is in this folder.
Read this file first, then follow the reading order below. Treat the documents as the memory of the previous working sessions:
the project was developed in one long, continuous engagement and this package is written so that you can carry on as if you had been there.

## What the project is (30 seconds)

A **Cost Engine** for a garment manufacturer, **United Textile Mills**. It **replaces the company's Excel costing sheets**:

* Costing values are **typed into the engine**. Excel and PDF files are **outputs** of the engine, not inputs.
* For each garment style there are **two independent costings**, each with its own rows, rules and version history:
  * **Actual costing** — what producing the order really cost (fabric, embellishment, CMT, trims, rejection/value loss, profit).
  * **Client costing** — the commercial quotation in the customer's own sheet layout (two layouts exist: the **GET layout** for the brand **Live Smart**, and the **YOUSTA layout** for the brand **YOUSTA**).
* The only things uploaded are the **style image** and the **CAD marker PDF** (cutting layout). The CAD feeds fabric consumption.
* It compares Actual vs Client, keeps provenance for every number, versions every save, logs an audit trail, exports Excel/PDF in the customer's format, and carries a cost analysis of 58 real costing sheets (standard costs, rates, consumption, margins) that powers a **Benchmarks** tab, an **Analysis** page and **Standard rates**.

## What is in this package

| Path | What it is |
|---|---|
| `00_START_HERE.md` | this file |
| `01_PROJECT_BRIEF.md` | goal, users, core concept, non-negotiable rules, scope |
| `02_ORIGINAL_SPECIFICATION.md` | the original requirements document, verbatim |
| `03_BUSINESS_AND_DOMAIN_GUIDE.md` | the garment-costing domain, the brands, how each sheet computes, glossary — **read before touching any calculation** |
| `04_ARCHITECTURE.md` | stack, repository map, data model, engine, parsers, CAD, export, the single-file build, analysis, API |
| `05_BUILD_HISTORY_AND_DECISIONS.md` | what was done, in order, and every significant decision with its reasons; corrections made by the business owner |
| `06_REJECTED_IDEAS_AND_LIMITATIONS.md` | ideas that were rejected, superseded or deferred, why, and what their limits are |
| `07_STATUS_PENDING_AND_ROADMAP.md` | what is finished, what is pending, open questions for the business owner, the recommended plan |
| `08_RUNBOOK.md` | how to run, test, build and extend; troubleshooting |
| `09_TESTING_AND_VERIFICATION.md` | what is tested, what was verified and how, what was **not** verified |
| `10_DATA_INVENTORY.md` | every reference file (workbooks, CAD PDFs), what it is, quirks, protected files |
| `11_GOTCHAS_AND_WORKING_AGREEMENTS.md` | traps, conventions, mistakes made before — and how the work should be done |
| `CHANGELOG.md` | the commit history (subject lines) |
| `NEW_SESSION_PROMPT.txt` | a ready-made first message to give the AI in a new session |
| `deliverables/cost-engine.html` | **the finished product**: the whole Cost Engine as ONE file. Double-click it; no install, no server, no internet |
| `deliverables/analysis/` | the cost-analysis workbook and the data it was built from |
| `project-source/` | the complete source code (a snapshot of the repository), ready to `npm install` and run |
| `reference-data/` | the real costing workbooks and CAD PDFs the project was built from and verified against |

## Reading order

1. This file → `01_PROJECT_BRIEF.md` → `03_BUSINESS_AND_DOMAIN_GUIDE.md` (the domain is the hard part).
2. `04_ARCHITECTURE.md` and `05_BUILD_HISTORY_AND_DECISIONS.md` (how it is built and why).
3. `07_STATUS_PENDING_AND_ROADMAP.md` (what to do next) and `06_REJECTED_IDEAS_AND_LIMITATIONS.md` (what *not* to redo).
4. `08_RUNBOOK.md` when you need to run something, `11_GOTCHAS_AND_WORKING_AGREEMENTS.md` before you change code.
5. `02_ORIGINAL_SPECIFICATION.md` when you need the exact original wording of a requirement.

Inside `project-source/` the repository's own documents are also useful: `README.md`, `docs/DATA_MODEL.md` (field-by-field mapping from the first three workbooks; partly historical, see the note at its end), `docs/REAL_SCOPE.md` (what the real files imply), `docs/COST_ANALYSIS.md` (the cost analysis in words).

## If you only have a few minutes

1. Open `deliverables/cost-engine.html` in Chrome, Edge or Firefox (it was tested in Chromium). Create a style, type some values in Actual and Client costing, apply the CAD (`reference-data/cad-markers/`), save, export.
2. Know the five facts that cause the most mistakes:
   * The workbooks are **reference only** — never import them as costings; the engine is the system of record.
   * **Actual and Client are independent** — never derive one from the other (no "markup").
   * **Never silently guess** a CAD value, a style match, a rate or a brand mapping — flag it for confirmation.
   * **Never overwrite a saved version**; every save is a new immutable version and overrides keep the original value.
   * The brand **Live Smart** uses the GET layout and its styles are numbered 4xxx/5xxx/6xxx; **YOUSTA** has its own layout and numbering (see the domain guide).
3. Run the checks (`08_RUNBOOK.md`): `npm install`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:standalone`, `npm run verify:workbooks`, `npm run verify:export` (needs LibreOffice), and after `npm run standalone:build` the browser check `npm run smoke:standalone`.

## State of the project at hand-over

* Working and verified: everything listed as done in `07_STATUS_PENDING_AND_ROADMAP.md` — 104 automated tests (96 without a database + 8 database tests that also run against the in-browser store), typecheck and lint clean, the calculation engine reproduces the calculated values of **all** the readable reference workbooks (85 costing sheets — 63 actual + 22 client — and 766 compared values, 0 differences), exported Excel files recalculate identically in LibreOffice (387 live formulas, 0 differences), and a 13-step browser smoke test passes on the final HTML.
* Not done / waiting on the business owner: passwords for five protected client workbooks, colourways, several CAD markers per style, structured production fields, a brand summary report, variance warnings, login/multi-user hosting. Details and recommended designs are in `07_…`.
* An intended in-depth, multi-agent review of the whole project was started and then cancelled before any reviewer finished; a smaller solo review was done instead. The areas that therefore have **not** been independently reviewed are listed in `09_…` — a good first task for you.

## Handling of the data

`reference-data/` and the analysis files contain **real commercial costing data** (rates, prices, margins, vendor codes) of the manufacturer and its customers. Author names and machine paths have been removed from the files' metadata. Keep the material confidential and do not publish it.

## Ground rules for you (the AI)

* Do not invent costing rules, rates, brand mappings or defaults. If something is ambiguous, state the ambiguity, show the evidence and ask the business owner.
* Verify before you claim: run the tests, run the workbook verifier, test in a real browser, and report results faithfully — including what you did not check.
* Keep the business owner informed in plain language (they are a costing/commercial person, not a developer): what changed, what to look at, what you need from them.
* Do not create a pull request or push to a shared branch unless the person you work for asks you to.
