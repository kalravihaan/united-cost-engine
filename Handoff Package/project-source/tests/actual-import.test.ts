import { describe, expect, it } from "vitest";
import { actualFixture, close, rawActualWorkbook } from "./fixtures";
import { calculateActualCost } from "@/lib/calculations/actual";

describe("Excel import – actual_costing.xlsx", () => {
  it("detects every worksheet and keeps style numbers as text", async () => {
    const p = await actualFixture();
    expect(p.sheets).toHaveLength(28);
    const nums = p.sheets.map((s) => s.doc.style.number);
    expect(nums).toContain("0556");
    expect(nums).toContain("0557");
    expect(new Set(nums).size).toBe(28);
    expect(p.issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("reads structure, labels, source cells and formulas without hardcoding", async () => {
    const p = await actualFixture();
    const s = p.sheets.find((x) => x.doc.style.number === "78290")!.doc;
    expect(s.style.color).toBe("off white");
    expect(s.actual.orderPcs).toEqual({ qty: 2119, rate: 275 });
    expect(s.actual.consumption.value).toBe(1.38);
    const fab = s.lines.find((l) => l.item === "cotton slub")!;
    expect(fab).toMatchObject({ sectionKey: "FABRIC_ORDER", quantity: 3248, rate: 103.5, sourceFormula: "=C8*B8" });
    expect(fab.prov.rate?.ref).toMatchObject({ sheet: "78290", cell: "C8" });
    expect(s.lines.filter((l) => l.sectionKey === "TRIMS")).toHaveLength(16);
  });

  it("supports variable components: CMT KURTA + CMT BOTTOM, differing fabric labels", async () => {
    const p = await actualFixture();
    const k = p.sheets.find((x) => x.doc.style.number === "67762")!.doc;
    expect(k.lines.filter((l) => l.sectionKey === "CMT").map((l) => l.item)).toEqual(["CMT KURTA", "CMT BOTTOM"]);
    expect(k.actual.consumption.formula).toBe("=1.93+0.24+1.26");
    expect(k.actual.consumption.value).toBeCloseTo(3.43, 10);
    const labels = new Set(p.sheets.flatMap((s) => s.doc.lines.filter((l) => l.sectionKey === "FABRIC_ORDER").map((l) => l.item.toLowerCase())));
    expect(labels.has("zipper")).toBe(true);
    expect(labels.has("hand work")).toBe(true);
  });

  it("flags source formula anomalies instead of silently fixing them", async () => {
    const p = await actualFixture();
    const t = p.sheets.find((x) => x.doc.style.number === "2220")!.doc;
    expect(t.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["TITLE_MISMATCH", "FORMULA_VARIANT"]));
    expect(t.actual.profitPctAddsValueLossPct).toBe(true);
    const normal = p.sheets.find((x) => x.doc.style.number === "78290")!.doc;
    expect(normal.actual.profitPctAddsValueLossPct).toBe(false);
    expect(normal.issues.some((i) => i.code === "FORMULA_ANOMALY")).toBe(true); // E12 =B12*C13
  });

  it("canonical recompute equals the workbook's own calculated values in all 28 sheets", async () => {
    const p = await actualFixture();
    for (const s of p.sheets) {
      const r = calculateActualCost(s.doc);
      const c = s.cached;
      const name = s.doc.style.number;
      expect(close(r.orderSale, c.orderSale), `${name} orderSale`).toBe(true);
      expect(close(r.dispatchSale, c.dispatchSale), `${name} dispatchSale`).toBe(true);
      expect(close(r.totalFabricCost, c.totalFabricCost), `${name} totalFabricCost`).toBe(true);
      expect(close(r.totalTrimsCost, c.totalTrimsCost), `${name} totalTrimsCost`).toBe(true);
      expect(close(r.totalCost, c.totalCost), `${name} totalCost`).toBe(true);
      expect(close(r.costPerPc, c.costPerPc), `${name} costPerPc`).toBe(true);
      expect(close(r.profit, c.profit), `${name} profit`).toBe(true);
      expect(close(r.perPcProfit, c.perPcProfit), `${name} perPcProfit`).toBe(true);
      expect(close(r.profitPct, c.profitPct), `${name} profitPct`).toBe(true);
      expect(close(r.totalValueLoss, c.totalValueLoss), `${name} totalValueLoss`).toBe(true);
      expect(close(r.valueLossPct, c.valueLossPct), `${name} valueLossPct`).toBe(true);
    }
  });

  it("matches known spreadsheet values (78290 and the value-loss sheets)", async () => {
    const p = await actualFixture();
    const r = calculateActualCost(p.sheets.find((x) => x.doc.style.number === "78290")!.doc);
    expect(r.totalCost).toBeCloseTo(493459.9, 6);
    expect(r.costPerPc).toBeCloseTo(232.87394997640396, 9);
    expect(r.profit).toBeCloseTo(89265.1, 6);
    expect(r.perPcProfit).toBeCloseTo(42.12605002359604, 9);
    expect(r.profitPct).toBeCloseTo(15.318563644944012, 9);
    const l = calculateActualCost(p.sheets.find((x) => x.doc.style.number === "3113")!.doc);
    expect(l.totalValueLoss).toBe(22995); // 657 × 35
    expect(l.valueLossPct).toBeCloseTo(6.079402951076234, 9);
  });

  it("every source line total equals the cell the workbook calculated", async () => {
    const p = await actualFixture();
    const wb = await rawActualWorkbook();
    for (const s of p.sheets) {
      const ws = wb.getWorksheet(s.doc.source!.sheet)!;
      const r = calculateActualCost(s.doc);
      for (const l of s.doc.lines) {
        const row = Number(l.sourceRef!.cell!.replace(/\D/g, ""));
        const v = ws.getCell(row, 5).value as unknown as { result?: number } | number | null;
        const cached = typeof v === "object" && v !== null ? v.result : v;
        if (typeof cached !== "number") continue;
        expect(close(r.lineTotals[l.id], cached), `${s.doc.style.number} ${l.id}`).toBe(true);
      }
    }
  });
});
