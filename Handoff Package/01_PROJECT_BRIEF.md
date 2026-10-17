# 01 — Project brief

## Purpose

United Textile Mills makes garments (mostly kurtas and related women's wear) for retail brands. Its costing lived in Excel workbooks: one **actual costing** sheet per style and colour, and one **client costing** sheet per style in each customer's own layout. The goal is a **production-grade Cost Engine** that replaces those spreadsheets:

* a costing clerk selects a customer/brand, types a style number, uploads the style image and the CAD marker PDF, and then **enters the costing values in the engine**;
* the engine calculates exactly as the business's own formulas do, shows where every number came from, keeps every version and an audit trail, compares what the order cost with what the customer is quoted, and **produces** the Excel and PDF files.

The business wants accuracy first, then speed, then looks ("a serious internal enterprise costing system, not a prototype or a spreadsheet wrapper"). Premium, restrained enterprise UI; desktop first (1920×1080, 1440×900, 1366×768).

## The core concept — the most important thing to understand

> The purpose of the cost engine is **to replace the Excel**. The Excel is an **output** of the engine, not the input.
> The costing workbooks that were supplied are **reference only** (structure, terminology, formulas, and a way to verify the calculations).
> **Only the CAD (and the style image) is uploaded.** Everything else is entered in the engine.
> The Actual-vs-Client logic is correct as two *different* costings — **the particulars of the two differ**.
> **By default each mode opens with all its rows and headers, with an option to remove unwanted headers/rows for that style.**

This was stated by the business owner after the first build had wrongly treated the workbooks as data to import and display (see `05_…` and `06_…`). It overrides any reading of the original specification that suggests importing workbooks as costings.

## Users and constraints

* **Primary users:** costing / commercial staff at the manufacturer (non-developers). One to a few people. They cannot install developer tools (no Node, no Docker), so the primary deliverable is a **single HTML file** that runs with no install, plus a full server version (Next.js + PostgreSQL) for a later shared deployment.
* **Data sensitivity:** real rates, prices and margins. No outside services are called; the app works fully offline.
* **No authentication yet.** The acting user is a typed name recorded on versions and the audit log.

## Non-negotiable rules (from the original specification, section 32, plus later corrections)

1. Never delete or silently change source information.
2. Never invent a costing rule, field, rate, default or customer/brand mapping.
3. Never assume two differently named fields mean the same thing without validating.
4. Never hard-code style-specific values; never hard-code customer/brand mappings.
5. Never scatter business calculations across UI components — all calculation lives in `src/lib/calculations`.
6. Never use browser localStorage as the primary database (the single-file build uses IndexedDB autosave **plus** an explicit save-to-file as the real copy).
7. Never silently ignore missing values; validation warns.
8. Never overwrite historical versions; overrides keep the original value visible.
9. Preserve source terminology (the business's words, including typos such as "CONSUPMTION" in the source, are kept where they are source labels).
10. Keep Actual and Client logically independent; Client ≠ Actual + a fixed percentage.
11. Never silently guess CAD values or style matches: low confidence → show as editable and flag "verify" / "Possible match found — please confirm".
12. Keep the system modular: new costing categories, CAD layouts and Excel layouts must be addable.
13. (Correction) The engine is the system of record; workbooks are not imported as costings.
14. (Correction) Standard rates and benchmarks are guidance; nothing prices a costing unless a person ticks it.

## What was asked for, in outline (full text: `02_ORIGINAL_SPECIFICATION.md`)

Two costing engines (Actual, Client) preserving the workbooks' calculation chains; CAD PDF extraction layer (style number, length, width, efficiency, length per set, total length, pieces, size breakdown) with confidence flags; CAD → costing connection with provenance; Actual-vs-Client comparison; customer/brand/category/style masters; Excel and PDF export; versioning and audit; manual overrides that keep the original; style matching with confirmation; validation; a database (PostgreSQL + Prisma recommended); automated tests built from the supplied files; a phased development approach (inspect → data model → import → engine → CAD → schema → UI → connect → comparison → export/versioning/audit → verify).

## What exists now (summary; details in `07_…`)

* Full application (Next.js 16, React 19, Prisma 7, PostgreSQL 16) **and** the same application as one HTML file with an in-browser database.
* Two Client layouts (GET = Live Smart, YOUSTA) with the right price chain, Excel/PDF output in each customer's format, and YOUSTA's MSME price and category tiers.
* The default templates (all rows/headers per mode) learned from the reference workbooks, editable in the app.
* Masters, rules (comparison grouping, CAD mapping), versions, audit, provenance/overrides, expression inputs (`4065+1617`), delete style.
* Cost analysis across 58 real actual sheets and 22 client sheets; Analysis page; Benchmarks tab; standard rates in the masters and an opt-in "Standard rates" action on an Actual costing.

## Glossary of the project's own words

* **Style** — a garment design identified by a number (text, leading zeros matter: `0556`). **Colourway** — a colour variant of a style; the workbooks hold one costing sheet per colour (not yet modelled, see `07_…`).
* **Mode** — Actual or Client. **Layout** — a customer's client-costing sheet format (`DEFAULT` = GET/Live Smart, `YOUSTA`).
* **Template** — the default rows/headers a new costing of a mode (and, for Client, a layout) starts with; stored in the database, versioned, editable.
* **Version** — an immutable saved snapshot of a costing (document + engine result).
* **Provenance** — per-field origin tag: IMPORT, CAD, MANUAL, OVERRIDE, DERIVED, TEMPLATE, MASTER, DEFAULT.
* **Standard rates / benchmarks** — medians and ranges derived from the 58 reference actual sheets (Analysis).
* More domain words (CMT, FOB, MSME, LD charges, marker, fent, CUT/FUT …) are in `03_BUSINESS_AND_DOMAIN_GUIDE.md`.
