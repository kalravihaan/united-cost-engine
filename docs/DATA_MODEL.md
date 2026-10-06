# Data model & field mapping

This document is the output of the source-file study (Phase 1) and the mapping
(Phase 2). Every statement below was verified against the three source files in
`data/sources/` and is re-verified by the automated tests in `tests/`.

## 1. Source files — what they actually contain

### 1.1 `actual_costing.xlsx` — 28 worksheets, one fixed-row template

Sheet name = style number (kept as **text**: `0556`, `0557` have leading zeros).
Cell `A1` = `"<style> - <colour>"` (e.g. `78290 - off white`).

| Rows  | Block (source label)                | Columns                                   |
|-------|--------------------------------------|-------------------------------------------|
| 1     | header                               | A=title, B=`QTY`, C=`RATE`, D=`SALE`, E=`PURCHASE` |
| 2     | `ORDER PCS`                          | B=qty, C=sale rate, D=`=C2*B2`            |
| 3     | `DISPATCH PCS`                       | B=qty, C=sale rate, D=`=C3*B3`            |
| 6     | `FABRIC ORDER` (section header)      |                                           |
| 7     | `CONSUPMTION` (sic)                  | B = consumption per pc (m); may be a formula (`=1.93+0.24+1.26` in 67762) |
| 8–13  | fabric-order lines                   | label varies per sheet; `E=C*B` (qty = metres/units **purchased**, not per-pc) |
| 14    | `Total fabric cost`                  | `=SUM(E8:E13)`                            |
| 16–17 | `CMT` / `CMT KURTA` + `CMT BOTTOM`   | `E=C*B`                                   |
| 18    | `TRIMS` header                       |                                           |
| 19–34 | 16 trim lines                        | `E=C*B`                                   |
| 35    | `total trims cost`                   | `=SUM(E19:E34)`                           |
| 36    | `LD CHARGES`                         | value cell `E36`, blank in every sheet    |
| 37    | `Total Cost`                         | `=SUM(E35,E14,E16,E36)-D4` (two sheets also include `E17`) |
| 38    | `Cost per pc`                        | `=E37/B3` (dispatch pcs)                  |
| 39    | `PROFIT`                             | `=D3-E37`                                 |
| 41    | `PER PC PROFIT`, `profit %`          | `E41=C3-E38`; `D41=E41*100/C2` (two sheets: `+D50`) |
| 43–47 | `REJECT`: Fabric "A", Fabric "B", Garment "B", Garment "A" | `E=B*C` (qty × rate) |
| 49    | `Total Value Loss`                   | `=SUM(E44:E48)`                           |
| 50    | `% value loss`                       | `D50=E49/E37%` (= E49 × 100 / E37)        |
| G2–G5 | free-text notes                      | e.g. `fabric rec-2772mtr`, `cut pcs - 1827pcs` |

Variable parts: labels in rows 8–13 (`cotton slub`, `EMB`, `zipper`, `elastic`,
`emb mtr`, `lace`, `tassels with dori`, `HAND WORK`, `pst foil`, `dori lace`, …),
`CMT` vs `CMT KURTA` + `CMT BOTTOM`, notes, and blank (unused) slots.

**Source formula anomalies (reported by the importer, never silently "fixed"):**

* `E12 =B12*C13`, `E13 =B13*C14` (27/28 sheets): the trims-6/7 slots multiply by
  the *next row's* rate. Both slots are empty so the cached value is 0.
* `E46/E47` in 8 sheets are shifted one row (`=C47*B47`, `=C48*B48`). Their inputs are 0/blank,
  so cached values are 0.
* `D41 = E41*100/C2 + D50` in sheets `3113` and `2220` (profit % adds the % value loss).
* `E37` includes `E17` in sheets `67762`, `2397` (CMT BOTTOM). The engine sums *all* CMT lines,
  which is identical for the other 26 sheets because `E17` is blank there.
* Sheet `2220` has `A1 = "3113 - white"` (title belongs to sheet `3113`).
* `D4` is subtracted in `E37` but is empty in every sheet — modelled as `deduction` (default 0).

The engine uses the canonical own-row `qty × rate`. A canonical recompute equals the
workbook's cached values in **all 28 sheets** (test: `actual-import.test.ts`).

### 1.2 `client_costing.xlsx` — one worksheet (`5008`), one style

Columns A–X as listed in the brief. Findings:

* `Product ID` (`A2`) = `GETKRTSCUT5008 - BLACK`. `A3:A8` are free-text memo lines
  (`length wise cutting`, `with 1 pocket`, `L - 44"`, `BO - 49"`, `UNITED TEXTILE MILL PVT LTD`,
  `VENDOR CODE - RR10337044`) — kept as header notes, not as cost items.
* `Design ID` is blank. `Costing Scenario` (W) is blank. `Action` (X) = `C` on populated rows.
* `AB3:AB5` = `kg, mtr, pcs` – the list used by the `H2:H3` data validation (UOM list).
* Cost item categories in order: `Fabric`, `Sewing trims`, `Label & Tags`, `Packing Trims`,
  `EMB`, `PRINT`, `CM`, **Total (row 37)**, `Testing`, `Garment Rejection`, `Overhead+Margin`.
* An embedded style photo (anchored at A10) — imported as the style image of `5008`.

Calculation chain (all columns reproduced):

| Cell(s)                  | Formula                       | Meaning |
|--------------------------|-------------------------------|---------|
| `L{r}` rows 2–36, 38     | `=G*K`                        | Base Total (w/o GST factor) = Quantity × Price without GST |
| `O{r}`                   | `=L*N`                        | Input Cost (GST amount on base w/o GST) |
| `M{r}`                   | `=L+O`                        | Base Total (with GST) |
| `L37 Total`              | `=SUM(L2:L36)`                | subtotal of the *main* phase |
| `L39 Garment Rejection`  | `=L37*K39` (K = 0.02)         | **percent of Total**; Quantity `G39` is not used |
| `L40 Overhead+Margin`    | `=L37*K40` (K = 0.08)         | **percent of Total**; Quantity `G40` is not used |
| `L41 Total Cost`         | `=SUM(L37:L40)`               | Total + Testing + Rejection + Overhead+Margin |
| `O41`                    | `=SUM(O2:O40)`                | total GST |
| `L43 FOB Price`          | `=L41`                        |         |
| `L44 FINANCE COST 3%`    | `=L43*0`                      | rate factor currently 0 (note in `P44`: *"if non msme keep it as 0% and with formula"*) |
| `L45 FINAL PO PRICE`     | `=L43-L44`                    | **FOB minus finance cost** (sign preserved) |
| `L57 Transport`          | `3` (constant)                |         |
| `L58 FINAL PO PRICE Incl Transport` | `=L45+L57`         |         |
| `A59:D61`                | Overhead+margin table         | `8% / Core & Ultimate / 2500`, `10% / Fashion / 1800`, `12% / High Fashion / 1200` (header of D = `Qty`) |

Ambiguity flagged: the label says `FINANCE COST 3%` but the formula multiplies by `0`; the
engine keeps the formula factor as an explicit input (default = source value `0`) and shows the
3 % label as the reference rate. It is never applied silently.

### 1.3 `cad.pdf` — one page, text layer present

Header block (verified by the CAD parser test):

```
Style Name: #72232; Sets: 5,S/1,M/1,L/1,XL/1,XXL/1;
Length:3.87m;  Width:53inch;
Efficiency:68.47%; Date: 2026.9.19;
Length per Set:0.77m; Surface's Pieces Count:10;
Total Length:152.54m; Total pieces:10;
```

The drawing carries repeated labels `FRONT BLOCK CUT 2`, `#72232` and size tags `S M L XL XXL`.

Ambiguities flagged by the parser (never silently resolved):

1. `Total Length: 152.54m` — numerically it equals the 3.87 m marker expressed in **inches**
   (3.87 m = 152.36 in; 152.54 in = 3.874 m), not a total in metres. Extracted as printed
   (152.54 m) and marked *verify*.
2. `Length per Set 0.77 m` = `Length / Sets` (3.87 / 5 = 0.774). Consistent.
3. Only the piece `FRONT BLOCK CUT 2` is on this marker, so the value may not be the
   complete-garment consumption.
4. CAD width `53"` vs client sheet `Cuttable Width 52"` (different style) — shown as a width warning.
5. There is no costing for style `72232` in either workbook (see §4).

## 2. Mapping: Excel field → normalized field → application field → calculation

### 2.1 Actual costing

| Excel                    | Normalized (`CostLine`/`ActualParams`)          | App field                | Calculation |
|--------------------------|--------------------------------------------------|--------------------------|-------------|
| sheet name               | `style.number` (text)                           | Style #                  | — |
| `A1`                     | `style.label`, `style.color`                     | Style / colour           | split on first `-` |
| `B2`,`C2`,`D2`           | `actual.orderPcs.qty/rate`                       | Order PCS / rate / sale  | `sale = rate × qty` |
| `B3`,`C3`,`D3`           | `actual.dispatchPcs.*`                           | Dispatch PCS             | same |
| `B7`                     | `actual.consumption.value` (+ `formula`)         | Consumption (m/pc)       | CAD `Length per Set` feeds this |
| `A/B/C` rows 8–13        | `CostLine{section FABRIC_ORDER, item, quantity, rate}` | Fabric lines       | `total = qty × rate` |
| `E14`                    | result `totalFabricCost`                         | Total fabric cost        | Σ fabric-order lines |
| rows 16–17               | `CostLine{section CMT}`                          | CMT / CMT KURTA / CMT BOTTOM | `qty × rate` |
| rows 19–34               | `CostLine{section TRIMS}`                        | Trims                    | `qty × rate` |
| `E35`                    | result `totalTrimsCost`                          | Total trims cost         | Σ trims |
| `E36`                    | `CostLine{section LD_CHARGES, calc ENTERED_AMOUNT}` | LD charges            | entered amount |
| `D4`                     | `actual.deduction`                               | Deduction                | subtracted from Total Cost |
| `E37`                    | result `totalCost`                               | Total Cost               | fabric + CMT + trims + LD − deduction |
| `E38`                    | result `costPerPc`                               | Cost per pc              | `totalCost / dispatchPcs` |
| `E39`                    | result `profit`                                  | Profit                   | `dispatchSale − totalCost` |
| `E41`                    | result `perPcProfit`                             | Per pc profit            | `dispatchRate − costPerPc` |
| `D41`                    | result `profitPct`                               | Profit %                 | `perPcProfit × 100 / orderRate` (+ value-loss % in variant sheets) |
| rows 44–47               | `CostLine{section REJECT}`                       | Reject Fabric A/B, Garment A/B | `qty × rate` |
| `E49`, `D50`             | result `totalValueLoss`, `valueLossPct`          | Total value loss / %     | `Σ`; `loss × 100 / totalCost` |
| `G2:G5`                  | `notes[]`                                        | Notes                    | — |

### 2.2 Client costing

| Excel col | Normalized `CostLine` field | UI column |
|-----------|-----------------------------|-----------|
| A (row 2) | `style.productId`           | Product ID |
| A3:A8     | `client.headerNotes[]`      | Header notes |
| B         | `style.designId`            | Design ID |
| C         | `sectionLabel`              | Cost Item category |
| D         | `item`                      | Cost Item |
| E         | `description`               | Description |
| F         | `itemType`                  | Item Type |
| G / H     | `quantity` / `uom`          | Quantity / UOM |
| I / J     | `attributes.hsCode / duty`  | HS Code / Duty% |
| K         | `rate`                      | Price without GST |
| L         | computed `base`             | Base Total (W/o GST Factor) |
| M         | computed `withGst`          | Base Total (With GST) |
| N         | `gstRate`                   | GST |
| O         | computed `gst`              | Input Cost |
| P         | `currency`                  | Currency |
| Q–U       | `attributes.fabricType, fabricFinish, construction, knitGauge, cuttableWidth` | Fabric attributes |
| V–X       | `attributes.source, costingScenario, action` | Source / Scenario / Action |

### 2.3 CAD → costing (configurable rules in `src/data/defaultRules.ts`)

| CAD field        | Target                                                    | Notes |
|------------------|-----------------------------------------------------------|-------|
| `lengthPerSet` (m) | **Client**: `quantity` of the line `Main Fabric` (UOM mtr, per piece) | the client sheet's fabric quantity *is* per-garment consumption (`1.6 mtr × 77 = 123.2`) |
| `lengthPerSet` (m) | **Actual**: `consumption` (B7)                          | Actual fabric `quantity` (B8) is lot-level purchased metres: **never overwritten**; the engine only shows the CAD-implied requirement `consumption × order pcs` as a reference |
| `width` (in)     | validation vs line attribute `Cuttable Width`             | warning only |
| `efficiency`, `totalLength`, `totalPieces` | CAD panel / audit            | informational |

## 3. Normalized schema (TypeScript, `src/types`)

`CostingDoc = ActualCosting | ClientCosting` with common `CostLine[]`, per-field
`Provenance` (`IMPORT | CAD | MANUAL | OVERRIDE | DERIVED | TEMPLATE | MASTER | DEFAULT`), an
`original` value kept on every override, and a `SourceRef` (file, sheet, cell, column).

## 4. Customer / brand / style architecture

* Source files contain **no** customer or brand information → none is invented. Masters start empty
  and are created in *Masters → Customers/Brands*; a style is assigned to a customer/brand in
  *Masters → Styles* (or inline on the main screen). Mapping lives on `Style` only; the engine never reads it.
* Style matching (`src/lib/normalization/styleMatching.ts`) normalizes (case, `#`, whitespace, colour
  suffix, alpha prefix + numeric core, leading zeros) and returns a **confidence**. Only an exact
  normalized equality is auto-selected; everything else is "Possible match found — please confirm".
* Style `72232` (CAD) has no costing in either workbook: a costing must be started from a template
  (structure only, or copy of an existing costing, rows marked `TEMPLATE`).
