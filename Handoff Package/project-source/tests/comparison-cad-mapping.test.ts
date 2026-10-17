import { describe, expect, it } from "vitest";
import { actualFixture, cadFixture, clientFixture, close } from "./fixtures";
import { calculateActualCost } from "@/lib/calculations/actual";
import { calculateClientCost } from "@/lib/calculations/client";
import { compareCostings } from "@/lib/calculations/comparison";
import { applyCadToCosting, cadUsable } from "@/lib/calculations/cadMapping";
import { revertOverride, setLineField, addLine, removeLine, listOverrides } from "@/lib/calculations/overrides";
import { createFromTemplate } from "@/lib/calculations/template";
import { diffCostings } from "@/lib/calculations/diff";
import { DEFAULT_RULES } from "@/data/defaultRules";

describe("Actual vs Client comparison (explicit pairing of two real costings)", () => {
  it("is computed from the underlying lines and reconciles to both totals", async () => {
    const a = (await actualFixture()).sheets.find((s) => s.doc.style.number === "78290")!.doc;
    const c = (await clientFixture()).sheets[0].doc;
    const ar = calculateActualCost(a);
    const cr = calculateClientCost(c);
    const cmp = compareCostings(a, ar, c, cr, DEFAULT_RULES);

    const sumA = cmp.rows.reduce((s, r) => s + r.actualPerPc, 0);
    const sumC = cmp.rows.reduce((s, r) => s + r.clientPerPc, 0);
    expect(close(sumA, ar.costPerPc!)).toBe(true);
    expect(close(sumC, cr.totalCost.base)).toBe(true);
    expect(close(cmp.totals.differencePerPc, cr.totalCost.base - ar.costPerPc!)).toBe(true);
    expect(close(cmp.totals.premiumPct, ((cr.totalCost.base - ar.costPerPc!) * 100) / ar.costPerPc!)).toBe(true);
    expect(close(cmp.totals.actualTotal, ar.totalCost)).toBe(true);
    expect(close(cmp.totals.clientTotal, cr.totalCost.base * 2119)).toBe(true);
    for (const r of cmp.rows) expect(close(r.differencePerPc, r.clientPerPc - r.actualPerPc)).toBe(true);
    expect(cmp.unmapped.actual).toEqual([]);
    expect(cmp.unmapped.client).toEqual([]);
    // margin economics stay separate
    expect(close(cmp.margin.actualPerPcProfit, ar.perPcProfit)).toBe(true);
    expect(close(cmp.margin.clientOverheadMarginPerPc, 219.885 * 0.08)).toBe(true);
  });

  it("fabric group of the actual side is its fabric line / dispatch pcs", async () => {
    const a = (await actualFixture()).sheets.find((s) => s.doc.style.number === "78290")!.doc;
    const c = (await clientFixture()).sheets[0].doc;
    const cmp = compareCostings(a, calculateActualCost(a), c, calculateClientCost(c), DEFAULT_RULES);
    const fabric = cmp.rows.find((r) => r.group === "Fabric")!;
    expect(fabric.actualPerPc).toBeCloseTo(336168 / 2119, 9);
    expect(fabric.clientPerPc).toBeCloseTo(123.2 + 0.085 * 77, 9);
  });

  it("no unmapped lines across all 28 actual sheets with the default rules", async () => {
    const c = (await clientFixture()).sheets[0].doc;
    const cr = calculateClientCost(c);
    for (const s of (await actualFixture()).sheets) {
      const cmp = compareCostings(s.doc, calculateActualCost(s.doc), c, cr, DEFAULT_RULES);
      expect(cmp.unmapped.actual.map((l) => l.item), s.doc.style.number).toEqual([]);
    }
  });
});

describe("CAD → costing connection", () => {
  it("feeds Length per Set into Main Fabric quantity (client) and keeps the imported value as original", async () => {
    const c = (await clientFixture()).sheets[0].doc;
    const cad = await cadFixture();
    const { doc, applied, skipped } = applyCadToCosting(c, cad, DEFAULT_RULES.cadMappingRules, { by: "t", now: () => new Date("2026-02-02T00:00:00Z") });
    const main = doc.lines.find((l) => l.item === "Main Fabric")!;
    expect(main.quantity).toBe(0.77);
    expect(main.prov.quantity).toMatchObject({ origin: "CAD", original: { value: 1.6, origin: "IMPORT" } });
    expect(main.prov.quantity!.ref!.note).toMatch(/CAD → Style 72232/);
    expect(applied).toHaveLength(1);
    expect(skipped).toEqual([]);
    // only the mapped line changed
    expect(doc.lines.find((l) => l.item === "Trim Fabric1")!.quantity).toBe(0.085);
    expect(calculateClientCost(doc).lineResults[main.id].base).toBeCloseTo(0.77 * 77, 12);
    expect(doc.cadApplied).toMatchObject({ styleNumber: "72232", lengthPerSet: 0.77 });
  });

  it("feeds CONSUMPTION in actual costing but never the lot-level fabric quantity", async () => {
    const a = (await actualFixture()).sheets.find((s) => s.doc.style.number === "78290")!.doc;
    const cad = await cadFixture();
    const { doc } = applyCadToCosting(a, cad, DEFAULT_RULES.cadMappingRules);
    expect(doc.type === "ACTUAL" && doc.actual.consumption.value).toBe(0.77);
    expect(doc.type === "ACTUAL" && doc.actual.consumption.prov).toMatchObject({ origin: "CAD", original: { value: 1.38 } });
    expect(doc.lines.find((l) => l.item === "cotton slub")!.quantity).toBe(3248);
    const r = calculateActualCost(doc);
    expect(r.impliedFabricRequirement).toBeCloseTo(0.77 * 2119, 9); // reference only
    expect(r.totalCost).toBeCloseTo(493459.9, 6); // unchanged
  });

  it("does not use a CAD value that needs verification until the user confirms/edits it", async () => {
    const c = (await clientFixture()).sheets[0].doc;
    const cad = await cadFixture();
    const doubtful = { ...cad, lengthPerSet: { ...cad.lengthPerSet, requiresVerification: true } };
    expect(cadUsable(doubtful.lengthPerSet)).toBe(false);
    const r1 = applyCadToCosting(c, doubtful, DEFAULT_RULES.cadMappingRules);
    expect(r1.applied).toEqual([]);
    expect(r1.skipped[0].reason).toMatch(/verification/);
    const confirmed = { ...doubtful, lengthPerSet: { ...doubtful.lengthPerSet, manual: { value: 0.8, reason: "checked" } } };
    const r2 = applyCadToCosting(c, confirmed, DEFAULT_RULES.cadMappingRules);
    expect(r2.doc.lines.find((l) => l.item === "Main Fabric")!.quantity).toBe(0.8);
  });

  it("skips when the target UOM is not a length", async () => {
    const c = structuredClone((await clientFixture()).sheets[0].doc);
    c.lines.find((l) => l.item === "Main Fabric")!.uom = "kg";
    const r = applyCadToCosting(c, await cadFixture(), DEFAULT_RULES.cadMappingRules);
    expect(r.applied).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/UOM/);
  });
});

describe("manual overrides", () => {
  it("[CAD] 0.77 → [Override] 0.80 keeps both, uses the override, and can be reverted", async () => {
    const c = (await clientFixture()).sheets[0].doc;
    const { doc } = applyCadToCosting(c, await cadFixture(), DEFAULT_RULES.cadMappingRules);
    const id = doc.lines.find((l) => l.item === "Main Fabric")!.id;
    const o = setLineField(doc, id, "quantity", 0.8, { by: "u", reason: "pattern change" });
    const line = o.lines.find((l) => l.id === id)!;
    expect(line.quantity).toBe(0.8);
    expect(line.prov.quantity).toMatchObject({ origin: "OVERRIDE", original: { value: 0.77, origin: "CAD" }, reason: "pattern change", by: "u" });
    expect(calculateClientCost(o).lineResults[id].base).toBeCloseTo(0.8 * 77, 12);
    expect(listOverrides(o)).toHaveLength(1);
    // editing again keeps the FIRST original
    const o2 = setLineField(o, id, "quantity", 0.9);
    expect(o2.lines.find((l) => l.id === id)!.prov.quantity!.original!.value).toBe(0.77);
    // typing the original back clears the override
    const o3 = setLineField(o2, id, "quantity", 0.77);
    expect(o3.lines.find((l) => l.id === id)!.prov.quantity).toMatchObject({ origin: "CAD" });
    // explicit revert
    expect(revertOverride(o, id, "quantity").lines.find((l) => l.id === id)!.quantity).toBe(0.77);
    // original document untouched
    expect(doc.lines.find((l) => l.id === id)!.quantity).toBe(0.77);
  });

  it("typing into an empty field is MANUAL; imported lines are flagged removed, never deleted", async () => {
    const c = (await clientFixture()).sheets[0].doc;
    const blank = c.lines.find((l) => l.item === "Button")!;
    const e = setLineField(c, blank.id, "rate", 2.5);
    expect(e.lines.find((l) => l.id === blank.id)!.prov.rate).toMatchObject({ origin: "MANUAL" });
    const removed = removeLine(c, blank.id);
    expect(removed.lines).toHaveLength(c.lines.length);
    expect(removed.lines.find((l) => l.id === blank.id)!.removed).toBe(true);
    const before = calculateClientCost(c).totalCost.base;
    expect(calculateClientCost(removeLine(c, c.lines.find((l) => l.item === "Divider")!.id)).totalCost.base).toBeCloseTo(before - 0.2 * 1.1, 9);
    const custom = addLine(c, { ...blank, id: "custom:1", item: "Zari lace", quantity: 1, rate: 3 });
    expect(removeLine(custom, "custom:1").lines.find((l) => l.id === "custom:1")).toBeUndefined();
  });
});

describe("templates and version diffs", () => {
  it("structure-only template carries no values; values mode marks them TEMPLATE", async () => {
    const c = (await clientFixture()).sheets[0].doc;
    const s = createFromTemplate(c, { number: "72232" }, "STRUCTURE");
    expect(s.style.number).toBe("72232");
    expect(s.lines.every((l) => l.quantity === null && l.rate === null)).toBe(true);
    expect(s.lines.length).toBe(c.lines.length);
    expect(calculateClientCost(s).totalCost.base).toBe(0);
    const v = createFromTemplate(c, { number: "72232" }, "VALUES");
    expect(v.lines.find((l) => l.item === "Main Fabric")!.prov.rate!.origin).toBe("TEMPLATE");
    expect(calculateClientCost(v).totalCost.base).toBeCloseTo(242.3735, 9);
  });

  it("diff lists changed fields between versions", async () => {
    const c = (await clientFixture()).sheets[0].doc;
    const id = c.lines.find((l) => l.item === "Main Fabric")!.id;
    const next = setLineField(c, id, "rate", 80);
    const d = diffCostings(c, next);
    expect(d).toEqual([{ path: "Main Fabric.rate", before: 77, after: 80 }]);
    expect(diffCostings(null, c)[0].path).toBe("(new costing)");
  });
});
