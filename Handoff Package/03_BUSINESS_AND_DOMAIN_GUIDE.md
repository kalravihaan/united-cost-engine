# 03 — Business and domain guide

Read this before changing any calculation, parser, template or export. The code reproduces the manufacturer's own Excel logic; where this guide says "the sheet does X", the engine does X, even when X looks odd.

## 1. The company, brands and who the documents are for

* **United Textile Mills** (also written "UNITED TEXTILE MILL PVT LTD" on customer sheets) is the vendor. It manufactures women's garments (kurtas, tops, sets).
* **Live Smart** — a brand/customer. Its product IDs look like `GETKRTSCUT5008 - BLACK` (client sheet) and `YETKRTSCUT5008 - peach` (actual sheet); also `RETKRTS…`. Styles are four-digit: **5xxx** (the "CUT" series), **4xxx and 6xxx** (the "FUT" series). Its client costing sheet is the **GET layout** (the original client reference). Client vendor code on the sheet: `RR10337044`. The brand name was not written in any file; the business owner confirmed it ("the GET format is for the brand Live Smart"). The whole `…KRTS…` product family is treated as Live Smart; if any style of that family belongs to another brand, correct the classification (see §8).
* **YOUSTA** — a brand/customer. Product IDs like `YAS26ZWEWYF72232`; styles are five-digit (`7xxxx`, `6xxxx`) and four-digit `0xxx`–`3xxx`. Its client sheet is the **YOUSTA layout** (sheet name `revised format`, plus a one-row `excel update` sheet that feeds the customer's upload). Vendor code on the sheet: `32026735`.
* What "CUT" and "FUT" stand for is **not stated** in any file; they are only series labels taken from product IDs.
* No file contains a customer/brand master, so none is invented. Customers, brands and the style→brand mapping are entered by an administrator (Masters). A brand or customer can be assigned a client layout; a brand's layout wins over its customer's; a style with neither uses the default (GET) layout.

## 2. Two costings of the same style — and why they differ

| | Actual costing | Client costing |
|---|---|---|
| Question it answers | What did producing this order cost us? | What price do we quote / is the customer's PO price built from? |
| Source sheet | `actual costing.xlsx` family: one fixed-row sheet per style **and colour** | the customer's own sheet: one per style (colourways are separate files with the same sheet) |
| Quantities | lot level (metres bought, pieces cut/dispatched) | per garment (e.g. 1.6 mtr of Main Fabric per piece) |
| Result | cost per piece, profit, value loss | Total → Total Cost → FOB / final PO price |

They are **separate datasets**. Client is **not** Actual + a fixed percentage. The difference is data-driven and the Comparison tab explains it numerically, group by group.

## 3. Actual costing sheet — how it computes

One fixed layout per worksheet (sheet name = style number as **text**, `0556` keeps its zero; `A1` = `"<style> - <colour>"`).

| Block | What it is |
|---|---|
| `ORDER PCS`, `DISPATCH PCS` | quantity and sale rate; sale = rate × qty |
| `FABRIC ORDER` | a `CONSUPMTION` cell (sic) = metres **per piece**, then up to six free-text lines: the fabric purchase, its **finishing/printing** (often a second line), then add-ons (embroidery, lace, tassels, foil print, …). Each line: quantity (metres or units **bought for the lot**) × rate |
| `CMT` / `CMT KURTA` + `CMT BOTTOM` | cut-make-trim labour (stitching), quantity × rate; **billed on dispatched pieces** |
| `TRIMS` | about 17 lines (labels, tags, polybags, carton, freight …), quantity × rate |
| `LD CHARGES` | an amount; blank in every sheet seen |
| `Total Cost` | fabric + CMT + trims + LD − `D4` (a deduction cell, blank everywhere) |
| `Cost per pc` | Total Cost ÷ **dispatch** pieces |
| `PROFIT` | dispatch sale − Total Cost; `PER PC PROFIT` = dispatch rate − cost per pc |
| `profit %` | per-pc profit × 100 ÷ **order** rate (two sheets add the value-loss % — a variant the engine models as a flag) |
| `REJECT` block | Fabric "A", Fabric "B", Garment "B", Garment "A": quantity × rate |
| `Total Value Loss`, `% value loss` | Σ reject lines; loss × 100 ÷ Total Cost |
| notes (columns G/H) | free text: fabric received, fabric used, cut pieces, shipped, shortage, fent … |

Facts that matter:

* **Value loss is reported but never deducted** from Total Cost or profit in the sheets. The engine does the same (this understates real loss; flagged in the analysis, not changed).
* Fabric is **costed on the metres ordered**, not the metres received. In 18 of 21 sheets with notes less fabric was received than ordered (about 5.5 %). The engine follows the sheets; production fields (received/used) are a pending feature.
* Rates may be typed in the **wrong column** (`D` instead of `C` in value-loss rows of the 5008 colour sheets — the parser reads them) and **sums are typed into cells** (`=4065+1617`, `=1.1+0.8+1.35+0.05+0.17`); the engine keeps the value and the typed expression, and number inputs in the app accept sums.
* Known formula anomalies in the source (reported by the importer, never silently "fixed"): next-row references in two trims slots (`E12=B12*C13`), shifted reject formulas in 8 sheets, profit-% variant in sheets `3113`/`2220`/the 5008 sage & mustard sheets, `E17` included in Total Cost in two sheets. The engine uses the canonical own-row `qty × rate`; with it, **every readable sheet reproduces the workbook's own cached totals**.
* Wrong titles exist (sheet `5005` is titled "5056 - blue", `6100` "6012 - maroon", `2220` "3113 - white"; `5008 - peach` says SAGE GREEN): the style number is taken from the sheet name and the mismatch is reported.
* Some sheets are copies of others (`0557` = `0556`; the 5009 colour sheets share the production notes of `5008 - fuchsia`). They are kept in the analysis and flagged.
* Text typed as a number (`??` in `4112`) shows #VALUE! in Excel; the engine warns and treats it as blank.

## 4. Client costing — the GET layout (Live Smart)

Columns A–X (Product ID, Design ID, Cost Item category, Cost Item, Description, Item Type, Quantity, UOM, HS Code, Duty %, **Price without GST**, Base Total (w/o GST factor), Base Total (with GST), **GST**, **Input Cost**, Currency, fabric attributes…). Categories in order: `Fabric`, `Sewing trims`, `Label & Tags`, `Packing Trims`, `EMB`, `PRINT`, `CM`, **Total**, `Testing`, `Garment Rejection`, `Overhead+Margin`, then the price chain.

| Cell | Formula | Meaning |
|---|---|---|
| `L` (base) | `= G × K` | Quantity × Price without GST |
| `O` (input cost) | `= L × N` | GST amount |
| `M` (with GST) | `= L + O` | |
| `Total` | `Σ L` of the main rows | **excludes** GST |
| `Garment Rejection` | `Total × rate` (2 %) | percentage of Total; its quantity cell is unused |
| `Overhead+Margin` | `Total × rate` (8 %/10 %/12 % by category) | percentage of Total |
| `Total Cost` | `Total + Testing + Rejection + Overhead+Margin` | |
| `FOB Price` | `= Total Cost` | |
| `FINANCE COST 3%` | `= FOB × factor` | label says 3 %, the source formula multiplies by **0** → the factor is an explicit input defaulting to the source value; never applied silently |
| `FINAL PO PRICE` | `= FOB − finance cost` | note the minus sign |
| `Transport` | a constant (3 in the sample) | |
| `FINAL PO PRICE Incl Transport` | `= FINAL PO PRICE + Transport` | |

The sheet carries the **category table** under it: `Core & Ultimate 8 %`, `Fashion 10 %`, `High Fashion 12 %` (a quantity column beside it, 2500/1800/1200, is unexplained). The category chosen for a style sets the Overhead+Margin rate (written with provenance MASTER). Totals are on **base without GST** — GST is shown for the customer but is not in the price chain.

## 5. Client costing — the YOUSTA layout

Same columns A–O, but:

* Categories: `Fabric`, `Sewing trims`, `Label & Tags`, `Packing Trims`, **`Print/Emb/Washing`** (one header instead of EMB + PRINT), **`CM`**.
* **CM is a single row with a typed amount** (no quantity).
* "Total" and "Total Cost" labels are in column E; a header block in column A holds the product ID, `BRAND - YOUSTA`, vendor name and vendor code.
* After Total: `Testing` (GST 18 %), `Garment Rejection` (2 % of Total), `Overhead+Margin` (**by category**: Core and table products 8 %, Fashion 10 %, Fast Fashion 12 % — as written in the source; an earlier build wrongly used a fixed 12 %).
* **No finance, FOB or transport rows.** The price is **`FINAL PO PRICE NON-MSME VENDOR` (= Total Cost)**. Newer sheets (e.g. `2243 COSTING`) add `FINANCE COST 3% (MSME)` and **`FINAL PO PRICE MSME VENDOR`** = non-MSME price − 3 % (₹302.18 → ₹293.11). MSME = micro/small/medium enterprise vendors; the sheet pays them 3 % less. The engine models it as `pricing.msme {rate, financeLabel, priceLabel}`.
* The customer's **`excel update`** sheet (one row pulling the key numbers: price, MSME price, …) is reproduced in the export with live formulas; `Total Qty` there stays blank until PO quantity exists in the engine.
* Different default rows (MOP buttons, shank/snap, rivets, eyelet, lace, elastic, zipper, main tag, disclaimer tag, barcode, transparent tag, size sticker, strapping+wrapping, divider, gum tape, trim fabric 1–3, handwork, smocking, toggles, elastic loop, adjustable strap …) and different GST defaults per row.
* Fixed standards repeated in every YAS file: labels & tags ₹4.80, packing ₹6.24, testing ₹1.50, CM ₹75, rejection 2 %.
* Many YAS client files are **drafts**: fabric and embroidery are blank (totals ₹104–114 against PO prices of ₹336–370). Only `2243` and `…72300` carry fabric values.

## 6. CAD marker PDFs

A CAD file here is a **marker report** — a cutting layout for one fabric at one width — exported from pattern software as a PDF with a text layer ("Microsoft: Print To PDF"). Header block (read by label, not by coordinates): `Style Name: #72232`, `Sets: 5,S/1,M/1,L/1,XL/1,XXL/1`, `Length`, `Width`, `Efficiency`, `Date`, `Length per Set`, `Surface's Pieces Count`, `Total Length`, `Total pieces`.

* `Length per Set = Length ÷ Sets` and is the engine's **consumption** (metres per piece). It feeds Client `Main Fabric` quantity and Actual `CONSUPMTION` — **never** the Actual fabric-line quantity (that is lot metres bought; the engine only shows the CAD-implied requirement `consumption × order pcs` as a reference).
* **`Total Length` is labelled "m" but is numerically the length in inches** (3.87 m shows as "152.54"). It is extracted as printed, flagged VERIFY, and never used.
* Widths seen: 47", 51", 52", 53", 54". Style number in the CAD should equal the entered style (mismatch → warning).
* **One style can have several markers** (different fabrics: plain + print; parts cut in separate lays; alternative layouts). `#6206`: plain 1.10 m + print 0.78 m + final 1.35 m — the costing's consumption is typed `=1.1+0.8+1.35+0.05+0.17` = 3.47 m (sum of markers + 0.22 m). `#72232`: front block 0.77 m (10 pieces), AADA 0.93 m (35 pieces) and a full-width marker 1.52 m with 45 = 10 + 35 pieces (efficiency 89 % vs 68 % — alternatives; the combined one wins). The engine currently stores **one** CAD per style (the latest upload feeds the costing); several markers per style is a deferred feature.
* Where a CAD and a costing both exist, costed consumption ≈ CAD length per set + 0 … 7 %; fabric actually used per cut piece ≈ CAD length.

## 7. What the analysis found (headline numbers; full text in `project-source/docs/COST_ANALYSIS.md`)

58 unique actual sheets (63 read; 5 YOUSTA sheets are in both actual workbooks), 22–23 client sheets, the YOUSTA cost summary (17 styles); 249,405 dispatched pieces, ≈ ₹6.77 crore of sales.

| | Live Smart | YOUSTA |
|---|---|---|
| Sheets / pieces | 30 / 201,071 | 28 / 48,334 |
| Avg sale rate / pc | ₹264.4 | ₹301.9 |
| Avg cost / pc | ₹224.9 | ₹228.2 |
| Profit (as sheets compute it) | 14.9 % | 24.4 % |

Costs are almost identical; YOUSTA's higher margin comes from price. Standard cost per piece (median, kurta/top): Live Smart 5xxx plain ₹198.6, 5xxx embellished ₹211.1, 4xxx/6xxx embellished ₹259.2; YOUSTA plain ₹213.9, embellished ₹237.1. Landed fabric rate (₹/m incl. finishing): cotton 40x30 ≈ 69, cotton slub ≈ 77, PST/Gadhwal ≈ 73, rayon ≈ 82, cotton flex ≈ 92. CMT ≈ ₹63–67 per piece (sets ₹112–127). Trims are very stable (main label ₹0.55 / 0.67, price tag ₹1.75 / 3.10, carton ₹67 per ~45–48 pieces). Fabric ≈ 57–60 % of cost, CMT ≈ 30 %.
Samples per cell are often under 10 sheets — **indicative, not contractual**. A client-vs-actual pair is complete for only one style (5008); four YOUSTA pairs are drafts; style 6100's client file is password protected.

## 8. Things that are assumptions (confirm with the business owner)

1. All `…KRTS…` product IDs = Live Smart (supported by the owner's statement about the GET format and by the source file's name; not by any brand master).
2. The meaning of CUT/FUT and of the 2500/1800/1200 column next to the GET category table.
3. That value loss should stay outside profit (the sheets do it; the real economics would deduct it).
4. That costing on ordered metres is acceptable (the sheets do it).
5. The comparison grouping (which actual lines compare with which client category) is an interpretation, editable in Masters → Costing Rules.
6. Segments for Benchmarks are inferred from style-number shape (5xxx CUT, 4xxx/6xxx FUT, five-digit = YOUSTA) unless the style's brand/layout says otherwise.

## 9. Glossary

* **CMT** — cut, make, trim: the stitching/making labour charge per piece.
* **CM** — "cutting & making"/CMT as a single amount in client sheets.
* **FOB** — free on board price (here: the Total Cost before finance/transport).
* **PO price** — the price on the customer's purchase order.
* **GST** — Indian goods and services tax (12 %/18 % per item in the sheets). "Input cost" = GST amount.
* **MSME** — micro, small and medium enterprises; MSME vendors get a lower price in the YOUSTA layout (−3 %).
* **LD charges** — a charges row (believed liquidated-damages/late-delivery); an amount cell, blank in every sheet seen. Meaning not confirmed.
* **Marker** — the cutting layout of pattern pieces on fabric (CAD output). **Efficiency** — fabric utilisation of a marker.
* **Fent** — a leftover short length of fabric (remnant) noted in production notes.
* **Greige** — unfinished (grey) fabric, bought cheap and then finished/printed (a second fabric line).
* **Landed fabric rate** — (fabric purchase + its finishing/printing) ÷ metres purchased. Used by the analysis; the sheets do not show it directly.
* **40x30, slub, flex, PST/Gadhwal, poly cotton, rayon** — fabric types/constructions as they appear in the sheets (40×30 = a cotton thread-count construction).
* **Dispatch vs order pieces** — pieces shipped vs pieces ordered (dispatch/order ≈ 98 %). Cost per piece divides by dispatch; profit % uses the order rate.
* **Colourway** — a colour variant of a style; one actual sheet per colour exists (5008 × 6, 5009 × 2).
