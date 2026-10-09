# What the real costing folder shows (scope findings)

Source: the `costing` folder supplied for review (reference only; nothing from it is stored in the engine).
Findings were produced by running the existing engine/parsers over every file.

## 1. Files and what they are

| Files | What they are |
|---|---|
| `GETKRTSCUT5008` (+B/C/D), `GETKRTSFUT6421/6422/6457`, `client costing.xlsx` | **Client costing, "GET" format** (same layout as our client reference). B/C/D, 6421/6422 are colourways of the same style: only the header line changes (`GETKRTSCUT5008B - olive`). |
| `YAS26…` (14 files) | **Client costing, "YOUSTA / YAS" format** (sheet `revised format`) plus a one-row `excel update` sheet that pulls the key numbers for the customer's upload. |
| `YOUSTA COST SUMMERY.xlsx` | **Brand summary** across styles: PO qty, PO cost, dispatched qty, actual cost/pc (= the actual-costing sheet's *Cost per pc*), margin, margin %. |
| `actual costing.xlsx` (28 sheets) | **Actual costing**; sheet names match the YOUSTA summary styles. |
| `2243 COSTING.xlsx` | A further costing sheet (to be studied). |
| `GETKRTSFUT6002 ×2`, `6098`, `6099` | **Password protected**: cannot be read without the passwords. |
| 4 CAD PDFs (`cad.pdf` = #72232, #72145, #5008, #5009) | Marker reports. |

## 2. Engine verification on the real data

* **GET client sheets (8 files)**: Total, Total Cost, FOB and Final PO price all equal the workbook's own values.
* **CAD reader (4 PDFs, three different widths 51"/53"/54")**: style, sets, size breakdown, length, width, efficiency, length per set, pieces and date are
  extracted correctly in all four. *Total Length* is mislabelled `m` in every CAD but is numerically the length in **inches** (3.87 m × 39.37 = 152.4 → "152.54m";
  7.48 m → "294.46m"; 8.01 m → "315.39m"; 6.23 m → "245.2m"). It is flagged every time; it is not used for costing.
* **YAS sheets**: the existing parser reads the rows but **mis-totals** (e.g. 25.18 instead of 113.84) because the format differs (see §3).

## 3. How the YOUSTA client format differs from the GET format

* Same columns (A–O), but the **category list differs**: Fabric, Sewing trims, Label & Tags, Packing Trims, **Print/Emb/Washing** (one header instead of EMB + PRINT), **CM**.
* **CM is a single row with a fixed amount** (no quantity; amount typed straight into the row).
* "Total" and "Total Cost" labels sit in column **E**, not the description column.
* Post-total rows: Testing (GST 18%), Garment Rejection (2% of Total), Overhead+Margin (12% of Total, a fixed rate, no category tiers).
* **No finance cost, FOB, transport rows**. The price is `FINAL PO PRICE NON-MSME VENDOR` (= Total Cost) with an MSME variant cell.
* A **header block** in column A: product id, `BRAND - YOUSTA`, vendor name, vendor code.
* Different default rows: MOP Buttons, Shank/Snap, Rivets, Eyelet, LACE, Elastic, Adjustable elastic, Zipper, Main tag, Disclaimer Tag, Barcode, Transparent Tag, Size Sticker, Strapping + Wrapping, Divider, Gum Tape, Trim Fabric 1–3.
* Different GST defaults per row (e.g. Sewing Thread 12%, Main tag 18%, Testing 18%).

## 4. Consequences for the engine

1. Client costing needs **one default template per customer/brand format** (GET, YOUSTA, …); the format is picked from the style's customer/brand.
2. A **single-amount row** (CM) and a **price without finance/FOB** must be expressible per format (the calc already supports both; the template must declare them).
3. The **export must follow the customer's format** (the YOUSTA sheet + its `excel update` row), because that file is what the customer receives.
4. A **brand summary report** (PO value, actual cost, margin by style) is a third output, fed by the Actual + Client costings of the styles.
5. Colourways share one costing; the colour lives in the header line.

## 5. Status

Implemented (see README → *Client layouts per customer / brand*):

* Client templates keyed by layout (`DEFAULT` = GET, `YOUSTA`); layouts are learnt from a customer's sheet (Templates → *Add a client costing layout*) and assigned to brands / customers (Masters).
* The YOUSTA sheets parse and reproduce their own Total / Total Cost / final price; values typed into the YOUSTA template reproduce those totals (tests use two real sheets).
* Excel output follows the layout (sheet name, header wording, vendor/brand block, CM amount row, final-price row, `excel update` sheet); PDF and Comparison show the layout's own price chain.

Still open: brand summary report (§4.4), the encrypted GETKRTSFUT6002/6098/6099 files (passwords needed), `2243 COSTING.xlsx` (not yet studied), MSME price cell of the YOUSTA upload sheet (left blank), `Total Qty` of the upload sheet (left blank until PO quantity exists in the engine).

## 6. Second actual workbook (`livesmart_cost_closer.xlsx`, 35 sheets) – findings

Reviewed with the real parser and engine (`data/reference/actual_costing_2.xlsx`, tests in `tests/actual-import-2.test.ts`).

**Same format.** Every sheet has the identical row layout (rows 2–50, same anchors, same formulas). The engine recomputes all totals, cost per piece, profit and
per-piece profit of all 35 sheets equal to the workbook's own values. No new section or header exists.

**New or missing rows (fixed)**
* TRIMS: **photo tag** (replaces *match it tag* in the 6xxx series) was missing; *frieght* is just a misspelling of *freight* (now one row).
* FABRIC ORDER is six free-text rows: purchase of the fabric, its **finishing / printing** (billed as a second line in 22 sheets), then add-ons. Added a generic
  *Fabric finishing / printing* row; add-ons are now one row per kind: emb neck, emb sleeve, emb neck & sleeve, emb yoke + sleeve, emb front, emb palla, emb katha work,
  couching emb, foil print, lace neck, lace sleeve, tassels, tassels with coin, button (spelling variants such as *tassal*, *gadhwal emb neck mtr*, *sleeve emb* map to them).
  The Actual template grew from 40 to 55 rows; it is learnt from both workbooks (`npm run template -- actual a.xlsx b.xlsx`).
* Comparison groups: *tassal* was counted as Fabric (now Trims) and *frieght* as Trims (now Other); every row of both workbooks now lands in a group.

**Format quirks (handled)**
* Rate typed in **column D** with `=B46*D46` in the value-loss rows of the 5008 colourway sheets (value loss 6,160 was read as 0).
* **Text typed as a number** (`??` in 4112): Excel shows #VALUE!; the engine now warns and treats it as blank.
* **Sums typed into input cells**: dispatch `=4065+1617`, quantity `=14038-600`, CMT rate `=62.32+53.27`, consumption `=1.1+0.8+1.35+0.05+0.17`.
  The import keeps the value and the typed expression; number cells in the app now accept sums too.
* Known formula anomalies repeat in all sheets (`E12 =B12*C13`, `E13 =B13*C14`, profit % variant in the 5008 sage / mustard sheets); the engine keeps its canonical
  QTY × RATE and flags the variant, as before.
* Production notes beside the costing (fabric received, cut quantity, shipped quantity, shortage, fabric used, fent) are free text in columns G/H; kept as notes.
* Two sheets carry the wrong title (`5005` is titled *5056 - blue*, `6100` is titled *6012 - maroon*): reported as TITLE_MISMATCH, style number taken from the sheet name.

**Open (needs a decision): colourways.** The workbook holds one actual costing **per colour** of a style (5008 × 6 colours, 5009 × 2), each with its own order / dispatch
quantity, fabric received and cost per piece (197.80 – 220.02). The engine keeps one costing per style and mode, so these cannot all be stored yet. The client side shows the
same pattern (client files 5008, 5008B/C/D carry their own product IDs per colour).
