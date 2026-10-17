# 10 — Data inventory

Everything in `reference-data/` is **real commercial data** supplied by the business as reference material. It is used to learn structure, to verify the engine and to build the cost analysis. **None of it is stored as a style or costing in the product.** Author names and the original machine path were removed from the files' metadata (cell contents were not changed). Treat the material as confidential.

Naming convention in the files: a product ID such as `GETKRTSCUT5008 - BLACK` = customer prefix (`GET` on client sheets, `YET`/`RET` on actual sheets) + `KRTS` (the Live Smart family) + series (`CUT`/`FUT`) + style number + colour; `YAS26ZWEWYF72232` = YOUSTA's product code (the style number is the trailing digits, or the four-digit number for older `…WETYF0556`-type codes).

## 1. Actual-costing workbooks (`reference-data/actual-costing/`)

| File | Sheets | Content |
|---|---|---|
| `actual costing.xlsx` | 28 | the first actual workbook (the original reference). Sheets: `78290, 79062, 65440, 68119, 65424, 65432, 1714, 74643, 71429, 72145, 71447, 0556, 0557, 67762, 2825, 2397, 3113, 2220, 1851, 2358, 2355, 2349, 2394, 2388, 2395, 2386, 2362, 2083` — mostly **YOUSTA** styles (5-digit and `0xxx`–`3xxx`). In the repo it is `project-source/data/reference/actual_costing.xlsx` |
| `livesmart_cost_closer.xlsx` | 35 | the second actual workbook, mostly **Live Smart**: `4045, 4049, 4073, 4112, 4113, 4233` (FUT), `5004, 5007, 5008 ×6 colours, 5009 ×2 colours, 5052, 5053, 5056, 5005, 5060, 5059` (CUT), `6012, 6087, 6100, 6105, 6106, 6204, 6206, 6210` (FUT) and five YOUSTA sheets that also exist in the first workbook (`65424, 68119, 65440, 65432, 79062`). In the repo: `project-source/data/reference/actual_costing_2.xlsx` |

63 sheets read; **58 unique** (the five YOUSTA sheets are in both). Same fixed layout in every sheet (see `03_…` §3). Known data problems are listed in `project-source/docs/COST_ANALYSIS.md` §7 and in sheet "15 Data issues" of the analysis workbook.

## 2. Client-costing workbooks

### Live Smart — GET layout (`reference-data/client-costing/live-smart-GET-layout/`)
| File | Style | State |
|---|---|---|
| `GETKRTSCUT5008.xlsx` | 5008 (BLACK) | **complete** (fabric 1.6 mtr × ₹77, print, CM, trims) — the original client reference; identical to the first `client costing.xlsx`; repo copy `data/reference/client_costing.xlsx` |
| `GETKRTSCUT5008B.xlsx`, `…C.xlsx`, `…D.xlsx` | 5008 colourways B, C, D | same sheet, only the header line (colour) differs |
| `GETKRTSFUT6421.xlsx`, `…6422.xlsx` | 6421, 6422 | colourways of one style (dark grey …); fabric 1.51 × ₹70 |
| `GETKRTSFUT6457.xlsx` | 6457 | fabric 1.70 × ₹77 |

All GET sheets share: sewing ₹3.00, labels ₹3.85, packing ₹7.29, testing ₹0.50, rejection 2 %, overhead+margin 8 %; they differ in fabric, print/emb (₹14–51) and CM (₹62–65).

### YOUSTA layout (`reference-data/client-costing/YOUSTA-layout/`)
14 `YAS26…` files (styles `71429, 71447, 71717, 71718, 71734, 71735, 72067, 72145, 72232, 72276, 72278, 72300, 74597, 74643`) and `2243 COSTING.xlsx` (newer layout with MSME price). Facts:
* Only **`YAS26XWEWYF72300`** (repo fixture `tests/fixtures/yas_72300.xlsx`) and **`2243`** carry fabric values; the others are **drafts** (fabric and embroidery blank; totals ₹104–114 against PO prices ₹336–370). `YAS26ZWEWYF72232` is the YOUSTA reference used to learn the layout (repo copy `data/reference/client_costing_YOUSTA.xlsx`); `2243` is `data/reference/client_costing_YOUSTA_2243.xlsx`.
* **`YAS26XWEWYF71718.xlsx` and `YAS26ZWEWYF71717.xlsx` are byte-identical content** under two names (one is probably a mis-named copy).
* `72300` types the CM price as 85 in the price column but the amount 75 in the total column (hard-coded) — the total uses 75.
* Standards repeated in every YAS file: labels & tags ₹4.80, packing ₹6.24, testing ₹1.50, CM ₹75, rejection 2 %, overhead+margin 12 % (10 % on `2243`).

### Password-protected (`reference-data/protected-unreadable/`) — **unreadable, passwords not supplied**
`GETKRTSFUT6002_.xlsx` and `GETKRTSFUT6002_[1].xlsx` (identical), `GETKRTSFUT6098.xlsx`, `GETKRTSFUT6099.xlsx`, `GETKRTSFUT6100.xlsx`. They are Office "strong encryption" containers (AES-256). Style `6100` also has an actual sheet and a CAD — the most valuable one to unlock. The tools report them as unreadable; do not attempt to bypass the protection.

## 3. Brand summary (`reference-data/brand-summary/YOUSTA COST SUMMERY.xlsx`)
YOUSTA's cost summary across **17 styles** (PO quantity, PO cost, dispatched quantity, actual cost per piece, margin, margin %). Styles: `YAS26ZWEWYF68119, …65432, XWEWYF65424, ZWEWYF79062, …72145, …67762, XWEWYF71447, XWETYF0556, ZWEWYF71429, XWETYF0557, …1714, …2220/64701, XWEWYF74643, XWETYF3113, …2825, …2397, …1851`. Findings: its "actual cost" equals the actual sheet's cost per piece for 12 of 17 styles (the rest differ by ₹0.01–0.68); the PO cost equals the actual sheet's sale rate; colours often disagree with the actual sheets (do not match on colour). Basis for the pending *brand summary report* (`07_…` §4.4). YOUSTA totals: billed ₹93.7 lakh, cost ₹71.4 lakh, margin 23.8 %.

## 4. CAD marker PDFs (`reference-data/cad-markers/`)
Ten distinct marker reports (the original `cad.pdf` is the same file as `#72232 53 AADA BLOCK MARKER.pdf`; repo fixture `tests/fixtures/cad_72232.pdf`):

| Style | Marker | Length per set |
|---|---|---|
| 72232 | `#72232 53 AADA BLOCK MARKER` (block, 10 pieces — the original sample) | 0.77 m |
| 72232 | `#72232 53 WIDTH AADA MARKER` (35 pieces) | 0.93 m |
| 72232 | `#72232 53 WIDTH MARKER` (full width, 45 = 10 + 35 pieces, efficiency 89 %) | 1.52 m |
| 72145 | `#72145 51 WIDTH MARKER MARKER FINAL` | 1.60 m (= the costing's consumption) |
| 5008 | `#5008 54 WIDTH MARKER` | 1.50 m (costing cell 1.61) |
| 5009 | `#5009 53 WIDTH MARKER FINAL (1)` | 1.25 m (cell 1.27) |
| 6100 | `#6100 52 WIDTH MARKER FINAL` | 1.59 m (cell 1.60) |
| 6206 | `#6206 WIDTH PLAIN MARKER FINAL` | 1.10 m |
| 6206 | `#6206 47 WIDTH PRINT MARKER FINAL` (one piece per size, so length per set ≠ Length ÷ Sets — flagged correctly) | 0.78 m |
| 6206 | `#6206 47 WIDTH MARKER FINAL` | 1.35 m |

All are text-layer PDFs ("Microsoft: Print To PDF" from the marker software); widths 47"–54". In every file `Total Length` is labelled "m" but is in inches.

## 5. Which styles have which files (68 style numbers across all files)
Six styles have **both** an actual sheet and a readable-or-protected client file: **5008** (complete), **71429, 71447, 72145, 74643** (YOUSTA drafts), **6100** (protected). The 17 YOUSTA summary styles also pair at price level. Everything else is one-sided. Full table: analysis workbook, sheet "13c Coverage by style".

## 6. Analysis outputs (`deliverables/analysis/`)
* `cost_analysis.xlsx` — 26 sheets: README, brand summary, segments, standard cost, fabric rates (by brand/type), consumption, production reconciliation, CAD markers vs costing, embellishment, CMT, trims rate card, cartons, sale tiers, margins, YOUSTA PO vs actual, client sheets, client vs actual (5008, all pairs), coverage by style, colourways, data issues, dataset.
* `cost_analysis.tables.json` — the same tables as JSON (what the app embeds as `src/data/analysisSnapshot.json`).
* `extracted-costing-data.json` — the flat extraction of every workbook/CAD (input of the Python analysis script; produced by `scripts/extract-costing-data.ts`).

## 7. Files inside `project-source/` that are data
`data/reference/` (5 workbooks), `tests/fixtures/` (`cad_72232.pdf`, `yas_72300.xlsx`), `assets/fonts/` (DejaVu Sans regular/bold for PDF export), `src/data/analysisSnapshot.json`.
