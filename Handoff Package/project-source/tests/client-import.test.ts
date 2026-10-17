import { describe, expect, it } from "vitest";
import { clientFixture, close, rawClientWorkbook } from "./fixtures";
import {
  calculateClientCost,
  calculateFinalPOPrice,
  calculateFinanceCost,
  calculateTransport,
} from "@/lib/calculations/client";
import { setLineField } from "@/lib/calculations/overrides";

describe("Excel import – client_costing.xlsx", () => {
  it("detects the sheet, headers, style and structure", async () => {
    const p = await clientFixture();
    expect(p.sheets).toHaveLength(1);
    const s = p.sheets[0];
    expect(s.doc.style).toMatchObject({ number: "5008", productId: "GETKRTSCUT5008 - BLACK", color: "BLACK" });
    expect(Object.keys(s.columns)).toEqual(expect.arrayContaining(["productId", "category", "item", "quantity", "rate", "baseTotal", "withGst", "gst", "inputCost", "cuttableWidth"]));
    expect(s.doc.client.sections.map((x) => `${x.label}:${x.phase}`)).toEqual([
      "Fabric:MAIN", "Sewing trims:MAIN", "Label & Tags:MAIN", "Packing Trims:MAIN", "EMB:MAIN", "PRINT:MAIN", "CM:MAIN",
      "Testing:POST_TOTAL", "Garment Rejection:POST_TOTAL", "Overhead+Margin:POST_TOTAL",
    ]);
    expect(s.doc.client.headerNotes).toContain("VENDOR CODE - RR10337044");
    expect(s.images).toHaveLength(1);
    expect(s.overheadTiers.map((t) => [t.category, t.rate, t.qty])).toEqual([["Core & Ultimate", 0.08, 2500], ["Fashion", 0.1, 1800], ["High Fashion", 0.12, 1200]]);
  });

  it("keeps quantity, UOM, rate, GST and item attributes distinct", async () => {
    const s = (await clientFixture()).sheets[0];
    const main = s.doc.lines.find((l) => l.item === "Main Fabric")!;
    expect(main).toMatchObject({ quantity: 1.6, uom: "mtr", rate: 77, gstRate: 0.05, itemType: "F", currency: "INR", calc: "QTY_X_RATE", sourceFormula: "=G2*K2" });
    expect(main.attributes).toMatchObject({ fabricType: "woven", fabricFinish: "regular", construction: "100% cotton", cuttableWidth: '52"', source: "VENDOR", action: "C" });
    expect(main.prov.rate?.ref).toMatchObject({ sheet: "5008", cell: "K2", column: "Price without GST" });
    const rej = s.doc.lines.find((l) => l.item === "Garment Rejection")!;
    expect(rej.calc).toBe("PERCENT_OF_SUBTOTAL");
    expect(rej.rate).toBe(0.02);
    expect(s.doc.lines.find((l) => l.item === "Overhead+Margin")!.calc).toBe("PERCENT_OF_SUBTOTAL");
  });

  it("reproduces every line (Base Total, Input Cost, With GST) and the summary chain", async () => {
    const s = (await clientFixture()).sheets[0];
    const wb = await rawClientWorkbook();
    const ws = wb.getWorksheet("5008")!;
    const r = calculateClientCost(s.doc);
    const cell = (a: string) => {
      const m = (ws.getCell(a) as unknown as { model: { result?: number; value?: number } }).model;
      return (m.result ?? m.value) as number;
    };
    for (const l of s.doc.lines) {
      const row = Number(l.sourceRef!.cell!.replace(/\D/g, ""));
      expect(close(r.lineResults[l.id].base, cell(`L${row}`)), `L${row} ${l.item}`).toBe(true);
      expect(close(r.lineResults[l.id].gst, cell(`O${row}`)), `O${row} ${l.item}`).toBe(true);
      expect(close(r.lineResults[l.id].withGst, cell(`M${row}`)), `M${row} ${l.item}`).toBe(true);
    }
    expect(r.total.base).toBeCloseTo(219.885, 9); // L37
    expect(r.total.withGst).toBeCloseTo(228.88604999999998, 9); // M37
    expect(r.totalCost.base).toBeCloseTo(242.37349999999998, 9); // L41
    expect(r.totalCost.withGst).toBeCloseTo(251.46454999999997, 9); // M41
    expect(r.totalCost.gst).toBeCloseTo(9.091049999999997, 9); // O41
    expect(r.fobPrice).toBeCloseTo(242.3735, 9);
    expect(r.financeCost).toBe(0);
    expect(r.finalPoPrice).toBeCloseTo(242.3735, 9);
    expect(r.transport).toBe(3);
    expect(r.finalPoPriceInclTransport).toBeCloseTo(245.3735, 9);
    const c = s.cached;
    expect(close(r.total.base, c.total)).toBe(true);
    expect(close(r.totalCost.base, c.totalCost)).toBe(true);
    expect(close(r.totalCost.withGst, c.totalCostWithGst)).toBe(true);
    expect(close(r.totalCost.gst, c.totalGst)).toBe(true);
    expect(close(r.finalPoPriceInclTransport, c.finalPoPriceInclTransport)).toBe(true);
  });

  it("garment rejection and overhead+margin are percentages of Total (not of Total Cost, not of quantity)", async () => {
    const s = (await clientFixture()).sheets[0];
    const r = calculateClientCost(s.doc);
    const rej = s.doc.lines.find((l) => l.item === "Garment Rejection")!;
    const oh = s.doc.lines.find((l) => l.item === "Overhead+Margin")!;
    expect(r.lineResults[rej.id].base).toBeCloseTo(219.885 * 0.02, 12);
    expect(r.lineResults[oh.id].base).toBeCloseTo(219.885 * 0.08, 12);
    // quantity is unused by the source formula
    const changed = { ...s.doc, lines: s.doc.lines.map((l) => (l.id === rej.id ? { ...l, quantity: 99 } : l)) };
    expect(calculateClientCost(changed).lineResults[rej.id].base).toBeCloseTo(219.885 * 0.02, 12);
  });

  it("GST: input cost = base × GST and with-GST = base + input cost", async () => {
    const s = (await clientFixture()).sheets[0];
    const r = calculateClientCost(s.doc);
    const bc = s.doc.lines.find((l) => l.item === "BARCODE TAG")!; // 1 × 1.95 @ 18 %
    expect(r.lineResults[bc.id]).toEqual({ base: 1.95, gst: 1.95 * 0.18, withGst: 1.95 + 1.95 * 0.18 });
  });

  it("finance cost, transport and final PO price", () => {
    expect(calculateFinanceCost(242.3735, 0.03)).toBeCloseTo(7.271205, 9);
    expect(calculateFinalPOPrice(242.3735, 7.271205)).toBeCloseTo(235.102295, 9); // FOB − finance (source L45 = L43-L44)
    expect(calculateTransport(235.102295, 3)).toBeCloseTo(238.102295, 9);
  });

  it("finance rate is an explicit input and flagged as ambiguous (label 3 %, formula ×0)", async () => {
    const s = (await clientFixture()).sheets[0];
    expect(s.doc.client.finance.rate).toBe(0);
    expect(s.doc.client.finance.referenceRate).toBe(0.03);
    expect(s.doc.issues.map((i) => i.code)).toContain("FINANCE_RATE_AMBIGUOUS");
    const withFinance = { ...s.doc, client: { ...s.doc.client, finance: { ...s.doc.client.finance, rate: 0.03 } } };
    const r = calculateClientCost(withFinance);
    expect(r.financeCost).toBeCloseTo(242.3735 * 0.03, 9);
    expect(r.finalPoPriceInclTransport).toBeCloseTo(242.3735 * 0.97 + 3, 9);
  });

  it("quantity × rate recalculates when an input changes (override keeps the original)", async () => {
    const s = (await clientFixture()).sheets[0];
    const main = s.doc.lines.find((l) => l.item === "Main Fabric")!;
    const edited = setLineField(s.doc, main.id, "rate", 80, { by: "tester" });
    expect(edited.lines.find((l) => l.id === main.id)!.prov.rate).toMatchObject({ origin: "OVERRIDE", original: { value: 77, origin: "IMPORT" } });
    const r = calculateClientCost(edited);
    expect(r.lineResults[main.id].base).toBeCloseTo(1.6 * 80, 12);
    // total cost moves by 4.8 × (1 + 0.02 + 0.08)
    const base = calculateClientCost(s.doc);
    expect(r.totalCost.base - base.totalCost.base).toBeCloseTo(4.8 * 1.1, 9);
  });
});
