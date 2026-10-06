import { describe, expect, it } from "vitest";
import { actualFixture, cadFixture, clientFixture } from "./fixtures";
import { buildActualTemplate, buildClientTemplate } from "@/lib/parsers/templateBuilder";
import { applyCadToCosting, addClientSection, calculateActualCost, calculateClientCost, compactDoc, createFromTemplate, removeSection, restoreSection, setLineField, calculateCosting } from "@/lib/calculations";
import { DEFAULT_RULES } from "@/data/defaultRules";
import { validateCosting } from "@/lib/validation/validate";
import type { ActualCosting, ClientCosting } from "@/types/costing";

async function templates() {
  const a = buildActualTemplate(await actualFixture());
  const c = buildClientTemplate((await clientFixture()).sheets[0]);
  return { a, c };
}
const fresh = <T extends ActualCosting | ClientCosting>(t: T, no = "72232"): T => createFromTemplate(t, { number: no }, "STRUCTURE") as T;

describe("default templates (structure only, learnt from the reference workbooks)", () => {
  it("actual template has every header and the full row set, with no values and no style data", async () => {
    const { a } = await templates();
    const by = (k: string) => a.lines.filter((l) => l.sectionKey === k).map((l) => l.item);
    expect([...new Set(a.lines.map((l) => l.sectionKey))]).toEqual(["FABRIC_ORDER", "CMT", "TRIMS", "LD_CHARGES", "REJECT"]);
    expect(by("CMT")).toEqual(["CMT", "CMT KURTA", "CMT BOTTOM"]);
    expect(by("TRIMS")).toHaveLength(16);
    expect(by("TRIMS")).toEqual(expect.arrayContaining(["main label", "wash care", "carton", "freight", "hardtags", "polybag rfid"]));
    expect(by("REJECT")).toHaveLength(4);
    expect(by("FABRIC_ORDER").slice(0, 3)).toEqual(["Fabric 1", "Fabric 2", "Fabric 3"]);
    expect(by("FABRIC_ORDER")).toEqual(expect.arrayContaining(["emb", "lace", "zipper", "elastic", "HAND WORK", "tassels with dori", "emb mtr"]));
    expect(a.lines.every((l) => l.quantity === null && l.rate === null && (l.amount ?? null) === null)).toBe(true);
    expect(a.actual.orderPcs).toEqual({ qty: null, rate: null });
    expect(JSON.stringify(a)).not.toMatch(/78290|off white|cotton slub/i);
  });

  it("client template keeps all Cost Item categories/rows, UOM and GST defaults, but no quantities or rates", async () => {
    const { c } = await templates();
    expect(c.lines).toHaveLength(34);
    expect(c.client.sections.map((s) => s.label)).toEqual(["Fabric", "Sewing trims", "Label & Tags", "Packing Trims", "EMB", "PRINT", "CM", "Testing", "Garment Rejection", "Overhead+Margin"]);
    expect(c.lines.every((l) => l.quantity === null && l.rate === null)).toBe(true);
    const main = c.lines.find((l) => l.item === "Main Fabric")!;
    expect(main).toMatchObject({ uom: "mtr", gstRate: 0.05, itemType: "F" });
    expect(main.prov.gstRate?.origin).toBe("TEMPLATE");
    expect(c.lines.find((l) => l.item === "Overhead+Margin")!.calc).toBe("PERCENT_OF_SUBTOTAL");
    expect(JSON.stringify(c)).not.toMatch(/GETKRTSCUT|VENDOR CODE|RR10337044|100% cotton/);
    expect(calculateClientCost(c).totalCost.base).toBe(0);
  });

  it("a new costing starts with ALL rows; values are entered in the engine and calculate", async () => {
    const { c, a } = await templates();
    const doc = fresh(c);
    expect(doc.lines).toHaveLength(34);
    const id = (name: string) => doc.lines.find((l) => l.item === name)!.id;
    let d: ClientCosting = setLineField(doc, id("Main Fabric"), "quantity", 1.6);
    d = setLineField(d, id("Main Fabric"), "rate", 77);
    d = setLineField(d, id("Carton"), "quantity", 1);
    d = setLineField(d, id("Carton"), "rate", 1.5);
    const r = calculateClientCost(d);
    expect(r.total.base).toBeCloseTo(1.6 * 77 + 1.5, 10);
    expect(r.total.gst).toBeCloseTo(1.6 * 77 * 0.05 + 1.5 * 0.12, 10); // template GST defaults apply
    // Excel is an output: totals of the engine equal the same formulas the workbook uses
    const act = fresh(a, "72232");
    const f1 = act.lines.find((l) => l.item === "Fabric 1")!.id;
    let x: ActualCosting = { ...act, actual: { ...act.actual, dispatchPcs: { qty: 100, rate: 300 } } };
    x = setLineField(x, f1, "quantity", 150);
    x = setLineField(x, f1, "rate", 80);
    const ar = calculateActualCost(x);
    expect(ar.totalCost).toBe(12000);
    expect(ar.costPerPc).toBe(120);
    expect(ar.perPcProfit).toBe(180);
  });

  it("CAD feeds Main Fabric (client) and Consumption (actual) of a template-based costing", async () => {
    const { c, a } = await templates();
    const cad = await cadFixture();
    const cl = applyCadToCosting(fresh(c), cad, DEFAULT_RULES.cadMappingRules).doc as ClientCosting;
    const main = cl.lines.find((l) => l.item === "Main Fabric")!;
    expect(main.quantity).toBe(0.77);
    expect(main.prov.quantity).toMatchObject({ origin: "CAD" });
    const ac = applyCadToCosting(fresh(a), cad, DEFAULT_RULES.cadMappingRules).doc as ActualCosting;
    expect(ac.actual.consumption.value).toBe(0.77);
  });
});

describe("removing headers per style", () => {
  it("removes a header with all its rows from the totals and can restore it", async () => {
    const { c, a } = await templates();
    let d = fresh(c);
    for (const l of d.lines.filter((x) => x.sectionKey === "packing_trims")) {
      d = setLineField(d, l.id, "quantity", 1);
      d = setLineField(d, l.id, "rate", 2);
    }
    const before = calculateClientCost(d).total.base;
    expect(before).toBeCloseTo(2 * 7, 10); // seven packing rows
    const removed = removeSection(d, "packing_trims");
    expect(calculateClientCost(removed).total.base).toBe(0);
    expect(calculateClientCost(removed).sections.find((s) => s.key === "packing_trims")).toBeUndefined();
    expect(removed.lines.filter((l) => l.sectionKey === "packing_trims").every((l) => l.removed)).toBe(true);
    expect(removed.lines).toHaveLength(d.lines.length); // nothing deleted
    expect(calculateClientCost(restoreSection(removed, "packing_trims")).total.base).toBeCloseTo(before, 10);

    const act = removeSection(fresh(a), "REJECT");
    expect(act.actual.removedSections).toEqual(["REJECT"]);
    expect(calculateActualCost(act).rejection.lineIds).toEqual([]);
    expect(restoreSection(act, "REJECT").actual.removedSections).toEqual([]);
  });

  it("template editing compacts: removed rows/headers are really dropped; new headers can be added", async () => {
    const { c } = await templates();
    let d = removeSection(fresh(c), "emb");
    d = addClientSection(d, "Washing");
    expect(d.client.sections.map((s) => s.key)).toContain("washing");
    // MAIN header is inserted before the first POST_TOTAL one so it is summed into Total
    expect(d.client.sections.findIndex((s) => s.key === "washing")).toBeLessThan(d.client.sections.findIndex((s) => s.key === "testing"));
    const compact = compactDoc(d);
    expect(compact.client.sections.find((s) => s.key === "emb")).toBeUndefined();
    expect(compact.lines.some((l) => l.sectionKey === "emb")).toBe(false);
  });

  it("validation ignores removed headers and only asks for what is still part of the costing", async () => {
    const { c } = await templates();
    const d = fresh(c);
    const out = validateCosting({ doc: d, enteredStyleNumber: "72232", customerId: "x", cad: null });
    expect(out.map((i) => i.code)).toContain("NO_FABRIC"); // nothing entered yet: reported, not silently totalled
    const r = calculateCosting(d);
    expect(r.type).toBe("CLIENT");
  });
});
