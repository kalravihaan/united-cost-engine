import { describe, expect, it } from "vitest";
import { actualFixture, actualFixture2 } from "./fixtures";
import { calculateActualCost } from "@/lib/calculations/actual";
import { DEFAULT_RULES } from "@/data/defaultRules";
import { benchmarkActual, fabricTypeOf, segmentFor } from "@/lib/analysis/benchmarks";
import { records, SNAPSHOT } from "@/lib/analysis/snapshot";
import type { ActualCosting } from "@/types/costing";

const bench = (doc: ActualCosting, styleNumber: string, clientFormat?: string) => benchmarkActual({ styleNumber, clientFormat, doc, result: calculateActualCost(doc), rules: DEFAULT_RULES });

describe("analysis snapshot", () => {
  it("embeds the analysis tables the app needs", () => {
    for (const t of ["1 Brand summary", "3 Standard cost", "4 Fabric rates", "7 CMT", "13c Coverage by style", "15 Data issues"]) expect(SNAPSHOT.tables[t]?.rows.length, t).toBeGreaterThan(0);
    const std = records("3 Standard cost");
    expect(std.map((r) => r.segment)).toContain("YOUSTA");
    for (const r of std) expect(r.cost_min as number).toBeLessThanOrEqual(r.cost_max as number);
  });
});

describe("benchmarks", () => {
  it("maps style numbers to segments", () => {
    expect(segmentFor("YETKRTSCUT5008")).toBe("Live Smart 5xxx (CUT)");
    expect(segmentFor("GETKRTSFUT6421")).toBe("Live Smart 4xxx/6xxx (FUT)");
    expect(segmentFor("5009")).toBe("Live Smart 5xxx (CUT)");
    expect(segmentFor("4045")).toBe("Live Smart 4xxx/6xxx (FUT)");
    expect(segmentFor("72232")).toBe("YOUSTA");
    expect(segmentFor("2243")).toBe("YOUSTA");
    expect(segmentFor("YAS26ZWEWYF72300")).toBe("YOUSTA");
    expect(segmentFor("5008", "YOUSTA")).toBe("YOUSTA");
    // the brand Live Smart (GET layout) decides, whatever the number looks like
    expect(segmentFor("72232", null, "Live Smart")).toBe("Live Smart 4xxx/6xxx (FUT)");
    expect(segmentFor("51", "DEFAULT", null)).toBe("Live Smart 5xxx (CUT)");
    expect(segmentFor("72232", null, "YOUSTA")).toBe("YOUSTA");
  });

  it("types fabrics like the analysis", () => {
    expect(fabricTypeOf("cotton slub")).toBe("Cotton slub");
    expect(fabricTypeOf("40X30s COTTON Greige")).toBe("Cotton 40x30");
    expect(fabricTypeOf("PST gadhwal")).toBe("PST / Gadhwal");
  });

  it("every reference sheet of the first workbook reports a cost, a segment and a cost-per-piece reading", async () => {
    const p = await actualFixture();
    let withStd = 0;
    for (const s of p.sheets) {
      const r = bench(s.doc, s.doc.source?.sheet ?? "");
      expect(r.rows.find((x) => x.key === "cost")?.value, s.doc.source?.sheet).not.toBeNull();
      if (!r.noStandard) withStd++;
    }
    expect(withStd).toBeGreaterThan(p.sheets.length / 2);
  });

  it("the reference sheets sit inside their own segment's cost range (standards are built from them)", async () => {
    const p = await actualFixture2();
    const s = p.sheets.find((x) => x.doc.source?.sheet === "4045")!;
    const r = bench(s.doc, "4045");
    expect(r.segment).toBe("Live Smart 4xxx/6xxx (FUT)");
    const cost = r.rows.find((x) => x.key === "cost")!;
    expect(cost.status).toBe("within");
    expect(r.rows.find((x) => x.key === "cmt")?.value).toBeGreaterThan(40);
  });

  it("flags a cost that is far above the segment range", async () => {
    const s = (await actualFixture2()).sheets.find((x) => x.doc.source?.sheet === "4045")!;
    const doc = structuredClone(s.doc);
    for (const l of doc.lines) if (l.sectionKey === "FABRIC_ORDER" && (l.rate ?? 0) > 0) l.rate = (l.rate ?? 0) * 2;
    const cost = bench(doc, "4045").rows.find((x) => x.key === "cost")!;
    expect(cost.status).toBe("above");
  });

  it("falls back to the segment's other kind when it has no sheet of this kind (no plain FUT sheet exists)", async () => {
    const s = (await actualFixture2()).sheets.find((x) => x.doc.source?.sheet === "4045")!;
    const doc = structuredClone(s.doc);
    for (const l of doc.lines) if (l.item.toLowerCase().includes("emb") && l.sectionKey === "FABRIC_ORDER") l.quantity = 0;
    const r = bench(doc, "4045");
    expect(r.embellished).toBe(false);
    expect(r.noStandard).toBe(false);
    expect(r.rows.find((x) => x.key === "cost")?.note).toMatch(/no plain sheet in this segment/);
  });
});

describe("standard rates for the masters", () => {
  it("builds fabric and rate rows from the analysis", async () => {
    const { standardRateRows, STANDARD_SOURCE } = await import("@/lib/analysis/standardRates");
    const { fabrics, rates } = standardRateRows();
    expect(fabrics.map((f) => f.name)).toEqual(expect.arrayContaining(["Cotton slub", "Cotton 40x30", "PST / Gadhwal", "Cotton flex", "Rayon"]));
    expect(fabrics.find((f) => f.name === "Cotton slub")).toMatchObject({ lastRate: 77, defaultUom: "m" });
    expect(fabrics.some((f) => f.name.includes(" + ") || f.name === "Other")).toBe(false);
    expect(new Set(rates.map((r) => r.sectionKey))).toEqual(new Set(["FABRIC_ORDER", "TRIMS", "CMT"]));
    expect(rates.find((r) => r.itemName === "carton (YOUSTA)")).toMatchObject({ rate: 67, sectionKey: "TRIMS" });
    expect(rates.find((r) => r.itemName === "CMT · Live Smart 4xxx/6xxx (FUT) · Kurta / top")).toMatchObject({ rate: 67.25, uom: "pc" });
    for (const r of rates) expect(r.source.startsWith(STANDARD_SOURCE) && r.rate > 0, r.itemName).toBe(true);
    expect(new Set(rates.map((r) => `${r.sectionKey}|${r.itemName}`)).size).toBe(rates.length);
  });
});
