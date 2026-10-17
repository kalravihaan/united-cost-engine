import { describe, expect, it } from "vitest";
import { actualFixture, actualFixture2, close } from "./fixtures";
import { calculateActualCost } from "@/lib/calculations/actual";
import { groupForLine } from "@/lib/calculations/grouping";
import { buildActualTemplate, canonicalRow } from "@/lib/parsers/templateBuilder";
import { DEFAULT_RULES } from "@/data/defaultRules";
import type { CostLine } from "@/types/costing";

/** Second actual workbook: 35 sheets (YET… products 4045–4233, 5004–5060, the 5008/5009 colourways, the 6xxx series, 6206). */
describe("second actual workbook (actual_costing_2.xlsx)", () => {
  it("reads all 35 sheets", async () => {
    const p = await actualFixture2();
    expect(p.sheets).toHaveLength(35);
    expect(p.issues.filter((i) => i.level === "error")).toEqual([]);
    for (const s of p.sheets) expect(s.doc.issues.filter((i) => i.level === "error"), s.doc.style.label).toEqual([]);
  });

  it("canonical recompute equals the workbook's own calculated values in every sheet", async () => {
    const p = await actualFixture2();
    for (const s of p.sheets) {
      const r = calculateActualCost(s.doc);
      const c = s.cached;
      const name = `${s.doc.source?.sheet}`;
      for (const [k, a, b] of [
        ["orderSale", r.orderSale, c.orderSale], ["dispatchSale", r.dispatchSale, c.dispatchSale], ["totalFabricCost", r.totalFabricCost, c.totalFabricCost], ["totalTrimsCost", r.totalTrimsCost, c.totalTrimsCost],
        ["totalCost", r.totalCost, c.totalCost], ["costPerPc", r.costPerPc, c.costPerPc], ["profit", r.profit, c.profit], ["perPcProfit", r.perPcProfit, c.perPcProfit], ["profitPct", r.profitPct, c.profitPct],
      ] as const) expect(close(a, b), `${name} ${k}: engine ${a} vs sheet ${b}`).toBe(true);
      // the sheet's own value-loss cells are #VALUE! in 4112 ('??' typed as a quantity): nothing to compare there
      if (c.totalValueLoss !== null) expect(close(r.totalValueLoss, c.totalValueLoss), `${name} valueLoss`).toBe(true);
    }
  });

  it("reads a rate typed in column D (value-loss row of '5008 - fuchsia': =B46*D46)", async () => {
    const s = (await actualFixture2()).sheets.find((x) => x.doc.source?.sheet === "5008 - fuchsia")!;
    const l = s.doc.lines.find((x) => x.sectionKey === "REJECT" && x.item.includes("GARMENT") && x.item.includes("B"))!;
    expect(l).toMatchObject({ quantity: 77, rate: 80 });
    expect(l.prov.rate?.ref?.cell).toBe("D46");
    expect(s.doc.issues.map((i) => i.code)).toContain("RATE_IN_COLUMN_D");
    expect(calculateActualCost(s.doc).totalValueLoss).toBe(6160);
    expect(close(calculateActualCost(s.doc).valueLossPct, s.cached.valueLossPct)).toBe(true);
  });

  it("flags text typed where a number belongs ('??') instead of silently using it", async () => {
    const s = (await actualFixture2()).sheets.find((x) => x.doc.source?.sheet === "4112")!;
    const w = s.doc.issues.filter((i) => i.code === "NON_NUMERIC_INPUT");
    expect(w.length).toBe(2);
    expect(w[0].message).toMatch(/\?\?/);
    expect(calculateActualCost(s.doc).totalValueLoss).toBe(0);
  });

  it("keeps sums typed into input cells (=1.1+0.8+1.35+0.05+0.17 consumption, =62.32+53.27 CMT rate, =14038-600 quantity)", async () => {
    const p = await actualFixture2();
    const by = (sheet: string) => p.sheets.find((x) => x.doc.source?.sheet === sheet)!.doc;
    const t6206 = by("6206");
    expect(t6206.actual.consumption.value).toBeCloseTo(3.47, 9);
    expect(t6206.actual.consumption.formula).toBe("=1.1+0.8+1.35+0.05+0.17");
    const cmt = t6206.lines.find((l) => l.sectionKey === "CMT")!;
    expect(cmt.rate).toBeCloseTo(115.59, 9);
    expect(cmt.prov.rate?.ref?.note).toBe("typed as =62.32+53.27");
    const fab = by("5053").lines.find((l) => l.sectionKey === "FABRIC_ORDER" && l.quantity === 13438)!;
    expect(fab.prov.quantity?.ref?.note).toBe("typed as =14038-600");
  });

  it("production notes beside the costing (fabric received, cut / shipped quantity, shortage) are kept", async () => {
    const d = (await actualFixture2()).sheets.find((x) => x.doc.source?.sheet === "5053")!.doc;
    expect(d.actual.notes).toEqual(expect.arrayContaining(["fabric rec by factory - 13118 mtr", "cut qnty - 8549pcs", "ship qnty - 8501pcs"]));
  });
});

describe("rows found in the second workbook", () => {
  const line = (item: string, sectionKey: string): CostLine => ({ id: item, sectionKey, sectionLabel: sectionKey, item, description: "", itemType: null, quantity: null, uom: null, rate: null, gstRate: null, currency: "INR", calc: "QTY_X_RATE", attributes: {}, prov: {} });
  const group = (item: string, sectionKey: string) => groupForLine(line(item, sectionKey), "ACTUAL", DEFAULT_RULES.groupRules)?.group;

  it("spelling variants are one row: frieght = freight, tassal/tassels/tassel with coin, 'gadhwal emb neck mtr' = emb neck", () => {
    expect(canonicalRow("frieght ")).toBe("freight");
    expect(canonicalRow("tassal")).toBe("tassels");
    expect(canonicalRow("tassel with coin")).toBe("tassels with coin");
    expect(canonicalRow("gadhwal emb neck mtr")).toBe("emb neck");
    expect(canonicalRow("gadhwal emb sleeve mtr")).toBe("emb sleeve");
    expect(canonicalRow("sleeve emb")).toBe("emb sleeve");
    expect(canonicalRow("pst emb yoke + sleeve")).toBe("emb yoke + sleeve");
    expect(canonicalRow("emb neck& sleeve")).toBe("emb neck & sleeve");
    expect(canonicalRow("lace sleeve")).toBe("lace sleeve");
    expect(canonicalRow("main label")).toBe("main label");
  });

  it("comparison groups: tassal → Trims, frieght → Other, photo tag → Labels & Tags, lace/button add-ons → Trims", () => {
    expect(group("tassal", "FABRIC_ORDER")).toBe("Trims");
    expect(group("tassel with coin", "FABRIC_ORDER")).toBe("Trims");
    expect(group("button", "FABRIC_ORDER")).toBe("Trims");
    expect(group("frieght", "TRIMS")).toBe("Other");
    expect(group("photo tag", "TRIMS")).toBe("Labels & Tags");
    expect(group("couching emb", "FABRIC_ORDER")).toBe("Embellishment");
    expect(group("pst finished", "FABRIC_ORDER")).toBe("Fabric");
  });

  it("every row of every sheet of both workbooks lands in a comparison group (rejection rows excepted)", async () => {
    for (const p of [await actualFixture(), await actualFixture2()])
      for (const s of p.sheets)
        for (const l of s.doc.lines.filter((x) => x.sectionKey !== "REJECT" && x.item.trim()))
          expect(groupForLine(l, "ACTUAL", DEFAULT_RULES.groupRules), `${s.doc.source?.sheet}: ${l.item}`).toBeTruthy();
  });

  it("the template learnt from both workbooks has photo tag, freight (one spelling), a fabric processing row and the neck/sleeve embroidery rows, but no style-specific fabric names", async () => {
    const t = buildActualTemplate([await actualFixture(), await actualFixture2()]);
    const items = (k: string) => t.lines.filter((l) => l.sectionKey === k).map((l) => l.item);
    expect(items("TRIMS")).toEqual(expect.arrayContaining(["match it tag", "photo tag", "freight"]));
    expect(items("TRIMS").filter((x) => /fr[ie]+ght/i.test(x))).toEqual(["freight"]);
    expect(items("FABRIC_ORDER")).toEqual(expect.arrayContaining(["Fabric 1", "Fabric 2", "Fabric 3", "Fabric finishing / printing", "emb neck", "emb sleeve", "emb neck & sleeve", "lace neck", "lace sleeve", "tassels", "button", "couching emb", "emb katha work"]));
    expect(items("FABRIC_ORDER").join("|")).not.toMatch(/gadhwal|40x30|greige|slub|\bpst\b|tassal/i);
    expect(t.lines.every((l) => l.quantity === null && l.rate === null)).toBe(true);
    // every row the template offers has a comparison group
    for (const l of t.lines.filter((x) => x.sectionKey !== "REJECT")) expect(groupForLine(l, "ACTUAL", DEFAULT_RULES.groupRules), l.item).toBeTruthy();
  });
});
