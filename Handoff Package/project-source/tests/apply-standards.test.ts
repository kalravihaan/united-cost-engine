import { describe, expect, it } from "vitest";
import { actualFixture2 } from "./fixtures";
import { calculateActualCost } from "@/lib/calculations/actual";
import { setLineField } from "@/lib/calculations/overrides";
import { applyStandardRates, planStandardRates, type MasterRate } from "@/lib/analysis/applyStandards";
import { standardRateRows } from "@/lib/analysis/standardRates";
import type { ActualCosting } from "@/types/costing";

const { rates } = standardRateRows();
const masters: MasterRate[] = rates.map((r) => ({ ...r }));
const ctx = { styleNumber: "4045" };

/** A costing whose CMT / trims / add-on rates are blank, as in a fresh template with quantities typed in. */
async function blankRates(): Promise<ActualCosting> {
  const s = (await actualFixture2()).sheets.find((x) => x.doc.source?.sheet === "4045")!;
  const doc = structuredClone(s.doc);
  for (const l of doc.lines) if (["CMT", "TRIMS", "FABRIC_ORDER"].includes(l.sectionKey) && !/^fabric/i.test(l.item)) { l.rate = null; delete l.prov.rate; }
  return doc;
}

describe("apply standard rates", () => {
  it("fills CMT, trims and add-ons from the masters, never fabric rows or quantities", async () => {
    const doc = await blankRates();
    const plan = planStandardRates(doc, masters, ctx);
    expect(plan.segment).toBe("Live Smart 4xxx/6xxx (FUT)");
    expect(plan.family).toBe("Live Smart");
    const by = (item: string) => plan.changes.find((c) => c.item.toLowerCase() === item.toLowerCase());
    expect(by("CMT")).toMatchObject({ to: 67.25, from: null, overwrites: false });
    expect(by("carton")).toMatchObject({ to: 67 });
    expect(by("main label")?.to).toBe(0.55);
    expect(by("wash care")?.to).toBe(0.39);
    expect(by("tassel with coin")?.to).toBe(2.6);
    expect(by("emb")?.to).toBe(24.5);
    expect(plan.changes.some((c) => /^fabric/i.test(c.item))).toBe(false);
    expect(plan.changes.some((c) => c.item.toLowerCase() === "cmt bottom")).toBe(false);

    const out = applyStandardRates(doc, plan.changes, { by: "t" });
    for (const c of plan.changes) {
      const a = doc.lines.find((l) => l.id === c.lineId)!;
      const b = out.lines.find((l) => l.id === c.lineId)!;
      expect(b.rate).toBe(c.to);
      expect(b.quantity).toBe(a.quantity);
      expect(b.prov.rate?.origin).toBe("MASTER");
    }
    // cost moves only through the filled rates
    const before = calculateActualCost(doc).totalCost;
    const after = calculateActualCost(out).totalCost;
    const expected = plan.changes.reduce((s, c) => s + (doc.lines.find((l) => l.id === c.lineId)!.quantity ?? 0) * c.to, 0);
    expect(after - before).toBeCloseTo(expected, 6);
  });

  it("marks rows that have no quantity yet, and lists rows with a quantity first", async () => {
    const doc = await blankRates();
    const plan = planStandardRates(doc, masters, ctx);
    const firstEmpty = plan.changes.findIndex((c) => !c.hasQuantity);
    expect(plan.changes.slice(firstEmpty).every((c) => !c.hasQuantity)).toBe(true);
    for (const c of plan.changes) expect(c.hasQuantity).toBe((doc.lines.find((l) => l.id === c.lineId)!.quantity ?? 0) > 0);
  });

  it("uses the YOUSTA family for trims and the segment's CMT", async () => {
    const plan = planStandardRates(await blankRates(), masters, { styleNumber: "72232" });
    expect(plan.segment).toBe("YOUSTA");
    expect(plan.changes.find((c) => c.item === "CMT")?.to).toBe(63.51);
    expect(plan.changes.find((c) => c.item.toLowerCase() === "price tag")?.to).toBe(3.1);
  });

  it("long garments take the set CMT", async () => {
    const doc = await blankRates();
    doc.actual.consumption = { value: 3.3 };
    expect(planStandardRates(doc, masters, ctx).changes.find((c) => c.item === "CMT")?.to).toBe(115.59);
  });

  it("flags rates already in the costing, and never replaces a rate a person typed", async () => {
    let doc = await blankRates();
    const cmt = doc.lines.find((l) => l.item === "CMT")!;
    const carton = doc.lines.find((l) => l.item.toLowerCase() === "carton")!;
    const tag = doc.lines.find((l) => l.item.toLowerCase() === "price tag")!;
    doc = setLineField(doc, cmt.id, "rate", 70, { by: "u" }, "MANUAL");
    doc = { ...doc, lines: doc.lines.map((l) => (l.id === carton.id ? { ...l, rate: 60 } : l)) }; // imported value, no provenance
    doc = setLineField(doc, tag.id, "rate", 2, { by: "u" }, "OVERRIDE");
    const plan = planStandardRates(doc, masters, ctx);
    expect(plan.keptTyped).toEqual(expect.arrayContaining(["CMT", tag.item]));
    expect(plan.changes.find((c) => c.item === "CMT")).toBeUndefined();
    expect(plan.changes.find((c) => c.lineId === carton.id)).toMatchObject({ from: 60, to: 67, overwrites: true });
    // applying over an imported value keeps it as the original
    const out = applyStandardRates(doc, plan.changes.filter((c) => c.lineId === carton.id));
    expect(out.lines.find((l) => l.id === carton.id)!.prov.rate).toMatchObject({ origin: "MASTER", original: { value: 60 } });
  });

  it("a rate master you added wins over the standard, and edited standards flow through", async () => {
    const doc = await blankRates();
    const edited = masters.map((m) => (m.itemName === "carton (Live Smart)" ? { ...m, rate: 72 } : m));
    edited.push({ costingType: "ACTUAL", sectionKey: "TRIMS", itemName: "Main Label", rate: 0.9, source: "Costing Desk" });
    const plan = planStandardRates(doc, edited, ctx);
    expect(plan.changes.find((c) => c.item.toLowerCase() === "carton")?.to).toBe(72);
    expect(plan.changes.find((c) => c.item.toLowerCase() === "main label")?.to).toBe(0.9);
  });

  it("an empty rate master gives an empty plan", async () => {
    expect(planStandardRates(await blankRates(), [], ctx).changes).toEqual([]);
  });
});
