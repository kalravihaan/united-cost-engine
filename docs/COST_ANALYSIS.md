# Cost analysis of the supplied costing files

Everything below is computed from the files themselves (workbook: `cost_analysis.xlsx`, rebuilt by
`scripts/extract-costing-data.ts` + `scripts/analysis/build_cost_analysis.py`; every actual sheet is first recomputed by the Cost Engine
and equals the workbook's own totals).

**Data used:** 63 actual sheets read (58 unique: 5 YOUSTA sheets sit in both actual workbooks), 23 client sheets (8 GET files = 3 distinct costings, 15 YOUSTA
files, of which only `2243` and `…72300` carry fabric values), the YOUSTA cost summary (17 styles). Four password-protected GETKRTSFUT files were not readable.
**Brand families are inferred**, because no file carries a brand master: *YOUSTA* (28 sheets: 5-digit styles and the 0xxx–3xxx series; vendor code 32026735) and
*KRTS (GET/YET)* (30 sheets: YETKRTS/RETKRTS product IDs, styles 4xxx/5xxx/6xxx; client vendor code RR10337044). The KRTS brand name is not stated anywhere.

Scale: 249,405 dispatched pieces, ₹6.77 crore of sale value.

## 1. The two families

| | KRTS (GET/YET) | YOUSTA |
|---|---|---|
| Sheets / pieces dispatched | 30 / 201,071 | 28 / 48,334 |
| Average sale rate / pc | **₹264.4** | **₹301.9** |
| Average cost / pc | ₹224.9 | ₹228.2 |
| Profit (weighted, as the sheets compute it) | **14.9%** | **24.4%** |
| Fabric (purchase + finishing) | 129.4 (57%) | 136.7 (60%) |
| Embellishment | 18.7 | 14.0 |
| Add-on trims (lace, tassels…) | 2.6 | 2.0 |
| CMT | 66.3 (30%) | 67.5 (30%) |
| Labels & tags / packaging | 3.7 / 4.2 | 4.5 / 3.6 |
| Value loss / pc (not in profit) | 1.05 | 0.80 |
| Dispatched ÷ ordered | 98% | 99% |

**Costs are almost identical (₹225 vs ₹228 a piece); the 9.5 points of extra margin on YOUSTA come entirely from the price (+₹37.5 a piece).**

## 2. Standard cost per piece (kurta / top, medians of the segment)

| Segment | Sheets | Sale | Fabric | Embroidery | Add-ons | CMT | Labels+packing | **Cost** | Range | **Profit** |
|---|---|---|---|---|---|---|---|---|---|---|
| KRTS 5xxx plain | 8 | 225 | 124.2 | – | – | 60.7 | 8.0 | **198.6** | 173–205 | 11.7% |
| KRTS 5xxx embellished | 8 | 240 | 124.2 | 8.5 | – | 69.7 | 7.5 | **211.1** | 189–220 | 12.0% |
| KRTS 4xxx/6xxx embellished | 13 | 320 | 130.0 | 46.8 | 6.3 | 67.3 | 8.6 | **259.2** | 246–273 | 17.8% |
| YOUSTA plain | 11 | 277.6 | 138.1 | – | 2.1 | 62.3 | 7.8 | **213.9** | 146–242 | 25.8% |
| YOUSTA embellished | 15 | 320 | 129.4 | 25.2 | – | 64.6 | 7.6 | **237.1** | 172–289 | 24.5% |

Sets / long garments (consumption ≥ 2.2 m: 67762, 2397, 6206) are separate: cost ₹304–468, CMT ₹112–127, fabric 2.4–3.6 m a piece.
Price ladders: KRTS 5xxx ₹200 / 225 / 230 / 240; KRTS 4xxx/6xxx ₹305–320 (set ₹490); YOUSTA ₹223–581, median ₹288.

## 3. Fabric: rates and consumption

Landed rate = purchase + finishing/printing, ₹ per metre bought.

| Fabric | Sheets | Median | Range | Fabric ₹/pc (median) |
|---|---|---|---|---|
| Cotton 40x30 | 12 | 69.3 | 65.9–75.0 | 127.8 |
| Cotton slub | 16 | 77.0 | 66.6–103.5 | 117.8 |
| Cotton flex | 8 | 92.3 | 79.0–95.8 | 156.4 |
| PST / Gadhwal | 10 | 72.9 | 68.5–95.0 | 128.0 |
| Rayon (incl. slub, foil) | 5 | 81.6–92.0 | 68.0–97.6 | 133 |
| Poly cotton | 3 | 68.2 | 67.9–68.2 | 144.0 |

* 40x30 cotton and poly cotton are bought as **greige (₹45–50/m) + finishing/printing (₹20–23/m)** in the 4xxx and early 5xxx sheets, and as finished fabric (₹68–75/m) in the later 5xxx sheets.
* **Consumption.** Costed consumption (the CONSUPMTION cell) has a median of **1.61 m (KRTS)** and **1.42 m (YOUSTA)**; metres purchased per dispatched piece are **1.68 / 1.57**, i.e. a
  median **+6.5% / +6.7%** allowance over the cell (middle half +4% to +14%). By fabric: cotton slub 1.38 → 1.56, 40x30 cotton 1.54 → 1.62, cotton flex 1.60 → 1.74, PST/Gadhwal 1.54 → 1.70, poly cotton 1.85 → 2.11.
* **CAD → costing.** Where a CAD exists: #72145 CAD 1.60 m = costing cell 1.60 m exactly; #6100 CAD 1.59 vs cell 1.60 (+0.6%); #5009 CAD 1.25 vs cell 1.27 (+1.6%); #5008 CAD 1.50 vs cell 1.61 (+7.3%). Fabric actually
  *used* per cut piece in 5008 is 1.48–1.51 m, i.e. the CAD length. The standard to use: **costed consumption = CAD length per set (+0 … 7%)**; real use ≈ CAD.
* **A style can have several markers.** #6206 has three (plain 1.10 m, print 0.78 m, final 1.35 m) and its costing consumption is typed `=1.1+0.8+1.35+0.05+0.17` = 3.47 m, i.e. the sum of the marker lengths plus 0.22 m; purchases are 3.57 m. #72232 has
  three markers too: front block 0.77 m (10 pieces, the earlier sample CAD), AADA 0.93 m (35 pieces) and the full-width marker 1.52 m (45 = 10 + 35 pieces, the efficient combined layout, 89% against 68%). The engine reads one CAD per style, so
  it needs several markers per style (a sum or a choice per fabric).
* The cell 1.38 appears on 6 sheets: a carried-over default. On 3113, 2220 the purchase is 34–35% above it.

## 4. CMT, embellishment, trims

* **CMT per piece** (kurta): KRTS 5xxx median ₹65.3 (46.7–71.2; 71.16 recurs on the 5008 sheets), KRTS 4xxx/6xxx ₹67.3 (60.6–74.5), YOUSTA ₹63.5 (50.5–83.6). Sets ₹112–127. CMT is billed on dispatched pieces (ratio 1.00).
* **Embellishment** is on 21 of 30 KRTS and 17 of 28 YOUSTA sheets, median ₹25 a piece when present. By kind (₹ per piece): emb neck & sleeve 8.4 (5xxx) – 24; neck emb 33.5–39; sleeve emb 10–29.5;
  front emb 18; palla emb 47–61; yoke emb 60; katha work 1.2–11; couching 7.5; hand work 11. Lace ₹0.9–7 and tassels ₹1.25–8 per metre/piece; foil-printed fabric ₹89/m.
* **Trims rate card** (very stable, so these are true standards): main label ₹0.55 (KRTS) / 0.67 (YOUSTA); wash care 0.39; price tag 1.75 (KRTS) / 3.10 (YOUSTA); size sticker 0.75; photo tag 0.75 (6xxx only);
  polybag + RFID 1.92–2.40 (median 2.08 / 1.95); carton **₹67 per carton, about 48 (KRTS) / 45 (YOUSTA) pieces per carton**; master polybag 5.1–6.75 (≈0.14 per piece); carton sticker 0.60; freight a lump of ₹4 (KRTS) / ₹3.
  Labels + packaging + freight come to **≈ ₹7.9 a piece (KRTS) and ₹8.4 (YOUSTA)**.

## 5. Price, margin and what the customer sheets allow

* **YOUSTA, 17 styles with a PO**: billed ₹93.7 lakh against actual cost ₹71.4 lakh = **margin ₹22.3 lakh, 23.8%**; per style 13.8%–33.2% (median 23.2%). The summary's actual cost equals the actual sheet's cost per piece
  (differences ≤ ₹0.68) and the PO cost equals the sheet's sale rate.
* **Which styles have both an actual and a client costing?** Six of the 68 style numbers in the files (sheet *13c Coverage by style*):

  | Style | Actual | Client file | State of the client file |
  |---|---|---|---|
  | 5008 | 6 colours | GETKRTSCUT5008 (+B/C/D colours) | complete (fabric, print, CM, trims) |
  | 71429, 71447, 72145, 74643 | 1 each | YAS26…71429 / 71447 / 72145 / 74643 | **draft**: fabric and embroidery blank, only the standard trims, CM ₹75, testing, 2% and 12% filled (total ₹104–114 against a PO price of ₹336–370) |
  | 6100 | 1 | GETKRTSFUT6100 | **password protected, cannot be read** |

  Earlier text called 5008 "the only style with both"; that was wrong. It is the only style where the client sheet is complete *and* readable. The 17 YOUSTA styles of the cost summary
  also pair at price level (PO price = the actual sheet's sale rate, section above). The other client files (5008B/C/D, 6421/6422, 6457, YAS 71717/71718/71734/71735/72067/72232/72276/72278/72300/74597, 2243,
  and the protected 6002 ×2, 6098, 6099) have no actual sheet.

* **Client costing vs actual, style 5008** (the one complete pair): client price ₹242.37, actual ₹212.05 (6 colours, weighted).

| ₹ per piece | Client | Actual | Client − actual |
|---|---|---|---|
| Fabric | 129.75 | 125.92 | +3.83 |
| Print / embroidery | 14.00 | 8.65 | +5.35 |
| Trims (sewing + label + packing) | 14.14 | 7.54 | **+6.60** |
| CM / CMT | 62.00 | 69.94 | **−7.94** |
| Testing, rejection 2%, overhead+margin 8% | 22.49 | 0 (profit, and ₹1.61 value loss outside cost) | +22.49 |
| **Total** | **242.37** | **212.05** | **+30.32** |

  The client sheet under-allows CM by ₹7.9 (12.8%) and over-allows trims by ₹6.6; the 8% overhead+margin line carries the profit.
* **The four YOUSTA pairs** (only the filled parts can be compared): client CM ₹75 against the CMT actually paid ₹74.36–75.10 (a pass-through, ±₹0.64); the client "main tag" ₹3.10 equals the actual price tag ₹3.10;
  client trims + labels + packing ₹14.5–23.5 against ₹7.5–16.0 actual (71429 +13.4, 71447 +16.0, 72145 +7.0, 74643 −2.1 because it also buys a zipper, elastic and wooden buttons).
* **YOUSTA client sheets** carry fixed standards (identical in every YAS file): labels & tags ₹4.80, packing ₹6.24, testing ₹1.50, CM ₹75, rejection 2%, overhead+margin 12% (10% on `2243`); category
  table Core and table products 8% / Fashion 10% / Fast Fashion 12%. Against YOUSTA actuals (labels 4.5, packaging 3.6, CMT median 63.5) the client packing allowance is +75% and CM +18%.
* **GET client sheets** are identical in sewing ₹3.00, labels ₹3.85, packing ₹7.29, testing ₹0.50, rejection 2%, overhead+margin 8%; they differ in fabric (1.51–1.70 m × ₹70–77), print/emb (₹14–51) and CM (₹62–65).
* **2243** (YOUSTA, newer layout): fabric 1.53 m @ ₹82 + trim fabric 0.12 m, emb ₹55, CM ₹65 → ₹302.18; **MSME vendors are paid 3% less (₹293.11)**.

## 6. Colourways (5008 × 6, 5009 × 2)

Same style, same price (₹240), cost ₹197.80–220.02 (+11%): fabric ₹114–133 a piece (metres per piece 1.48–1.72), CMT ₹67.2–71.2, value loss ₹0–40,610. Each colour has its own order, dispatch and fabric lot,
so each is a separate actual costing. 5008 weighted profit is 11.6% at ₹240.

## 7. Data issues found

See sheet *15 Data issues*: sheets that look copied (0557 = 0556; 5009 FUCHSIA = BLACK = the notes of 5008 fuchsia), wrong titles (5005, 6100, 2220), a stale consumption default (3113, 2220, 1851, 2362, 2083, 2386),
CM typed 85 against an amount of 75 (72300), value loss never deducted from profit (₹2.51 lakh, 0.45% of cost; 5059 = 10.2% of its cost), and **fabric costed on ordered metres although less was received**
(18 of 21 sheets: 5.5% of ordered metres, ₹6.5 lakh ≈ ₹6.3 a piece on the sheets whose notes are not duplicated).

## 8. What the engine can use

1. **Standard cost cards per family and segment** (section 2) and a **rate master** seeded from sections 3–4 (fabric by type, trims rate card, CMT bands, embroidery by kind), so a new style starts with defaults.
2. **Consumption standard** from the CAD (length per set × 1.00–1.07) and the allowance on purchase (~+6.5%), with a warning when a sheet's cell drifts > 15% from its purchase.
3. **Variance flags** at costing time: ordered vs received metres, value loss > 3% of cost, profit < 10%, CM above band, copied sheets.
4. **Colourways** as a level below style, and **production fields** (fabric received / used, pieces cut / shipped, shortage, fent) instead of free-text notes.
5. **MSME price** and **category tiers** for the YOUSTA layout (implemented with this analysis).
6. **Several CAD markers per style**, combined by sum or chosen per fabric (6206, 72232), and a password for the protected client files (6100 pairs with an actual sheet).
