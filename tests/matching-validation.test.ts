import { describe, expect, it } from "vitest";
import { actualFixture, cadFixture, clientFixture } from "./fixtures";
import { matchStyle, cadStyleMatches, type StyleCandidate } from "@/lib/normalization/styleMatching";
import { validateCosting } from "@/lib/validation/validate";
import { setLineField } from "@/lib/calculations/overrides";
import type { CostLine } from "@/types/costing";

async function candidates(): Promise<StyleCandidate[]> {
  const a = await actualFixture();
  const c = await clientFixture();
  return [
    ...a.sheets.map((s, i) => ({ id: `a${i}`, number: s.doc.style.number, names: [s.doc.style.label] })),
    ...c.sheets.map((s, i) => ({ id: `c${i}`, number: s.doc.style.number, names: [s.doc.style.label, s.doc.style.productId!] })),
  ];
}

describe("style matching", () => {
  it("exact normalized equality is the only automatic match", async () => {
    const r = matchStyle("78290", await candidates());
    expect(r.status).toBe("EXACT");
    expect(r.best!.candidate.number).toBe("78290");
    expect(matchStyle(" #78290 ", await candidates()).status).toBe("EXACT");
  });

  it("matches the client Product ID 'GETKRTSCUT5008 - BLACK' only as a possible match", async () => {
    const r = matchStyle("GETKRTSCUT5008", await candidates());
    // style number 5008 is a different spelling of the code → needs confirmation
    expect(r.status).toBe("POSSIBLE");
    expect(r.best!.candidate.number).toBe("5008");
    expect(r.message).toMatch(/confirm/i);
  });

  it("leading zeros are a possible match, never silent", async () => {
    const r = matchStyle("556", await candidates());
    expect(r.status).toBe("POSSIBLE");
    expect(r.best!.candidate.number).toBe("0556");
    expect(r.best!.confidence).toBeLessThan(1);
  });

  it("an unknown style (72232 – only present in the CAD) has no match", async () => {
    const r = matchStyle("72232", await candidates());
    expect(r.status).toBe("NONE");
    expect(r.best).toBeNull();
  });

  it("a one-character difference is only a low-confidence suggestion", async () => {
    const r = matchStyle("78291", await candidates());
    expect(r.status).toBe("POSSIBLE");
    expect(r.best!.confidence).toBeLessThanOrEqual(0.5);
  });

  it("a confirmed alias matches exactly; duplicates stay ambiguous", () => {
    const cands: StyleCandidate[] = [{ id: "1", number: "5008", confirmedAliases: ["GETKRTSCUT5008"] }];
    expect(matchStyle("GETKRTSCUT5008", cands).status).toBe("EXACT");
    const dup: StyleCandidate[] = [{ id: "1", number: "777" }, { id: "2", number: "#777" }];
    expect(matchStyle("777", dup).status).toBe("POSSIBLE");
  });

  it("CAD ↔ entered style", () => {
    expect(cadStyleMatches("72232", "72232")).toBe("MATCH");
    expect(cadStyleMatches("#72232", "72232")).toBe("MATCH");
    expect(cadStyleMatches("72231", "72232")).toBe("MISMATCH");
    expect(cadStyleMatches("72232", null)).toBe("UNKNOWN");
  });
});

describe("validation", () => {
  const codes = (xs: { code: string }[]) => xs.map((x) => x.code);

  it("reports missing style, customer and CAD", async () => {
    const out = validateCosting({ doc: null, enteredStyleNumber: "", customerId: null, cad: null, cadRequired: true });
    expect(codes(out)).toEqual(expect.arrayContaining(["STYLE_MISSING", "CUSTOMER_MISSING", "CAD_MISSING"]));
  });

  it("flags a CAD whose style number differs from the entered style", async () => {
    const cad = await cadFixture();
    const out = validateCosting({ doc: null, enteredStyleNumber: "99999", customerId: "c", cad });
    expect(codes(out)).toContain("CAD_STYLE_MISMATCH");
    expect(codes(validateCosting({ doc: null, enteredStyleNumber: "72232", customerId: "c", cad }))).not.toContain("CAD_STYLE_MISMATCH");
  });

  it("flags unverified CAD consumption and missing CAD width", async () => {
    const cad = await cadFixture();
    const bad = { ...cad, width: { ...cad.width, value: null }, lengthPerSet: { ...cad.lengthPerSet, requiresVerification: true } };
    const out = codes(validateCosting({ doc: null, enteredStyleNumber: "72232", customerId: "c", cad: bad }));
    expect(out).toEqual(expect.arrayContaining(["CAD_WIDTH_MISSING", "CAD_CONSUMPTION_UNVERIFIED"]));
  });

  it("line-level errors: negative quantity/rate, missing rate/qty/UOM, bad GST, duplicates", async () => {
    const doc = (await clientFixture()).sheets[0].doc;
    const mk = (over: Partial<CostLine>): CostLine => ({ ...doc.lines[0], id: "x:" + Math.random(), ...over });
    const lines = [
      mk({ item: "Neg", quantity: -1, rate: 5 }),
      mk({ item: "NegRate", quantity: 1, rate: -3 }),
      mk({ item: "NoRate", quantity: 2, rate: null }),
      mk({ item: "NoQty", quantity: null, rate: 4 }),
      mk({ item: "NoUom", quantity: 1, rate: 1, uom: null, sectionKey: "fabric", itemType: "F" }),
      mk({ item: "BadGst", quantity: 1, rate: 1, gstRate: 12 }),
      mk({ item: "Dup", quantity: 1, rate: 1 }),
      mk({ item: "Dup", quantity: 1, rate: 1 }),
    ];
    const out = codes(validateCosting({ doc: { ...doc, lines }, enteredStyleNumber: "5008", customerId: "c", cad: null }));
    for (const c of ["NEGATIVE_QUANTITY", "NEGATIVE_RATE", "RATE_MISSING", "QUANTITY_MISSING", "UOM_MISSING", "INVALID_GST", "DUPLICATE_COMPONENT"]) expect(out, c).toContain(c);
  });

  it("untouched template slots and the imported source do not raise errors", async () => {
    const doc = (await clientFixture()).sheets[0].doc;
    const out = validateCosting({ doc, enteredStyleNumber: "5008", customerId: "c", cad: null });
    expect(out.filter((i) => i.level === "error")).toEqual([]);
  });

  it("actual costing: missing dispatch pcs blocks Cost per pc", async () => {
    const doc = structuredClone((await actualFixture()).sheets[0].doc);
    doc.actual.dispatchPcs.qty = null;
    expect(codes(validateCosting({ doc, enteredStyleNumber: "78290", customerId: "c", cad: null }))).toContain("DISPATCH_PCS_MISSING");
  });

  it("no manual override is silently applied: editing records the override", async () => {
    const doc = (await clientFixture()).sheets[0].doc;
    const main = doc.lines.find((l) => l.item === "Main Fabric")!;
    const e = setLineField(doc, main.id, "quantity", 1.65, { by: "u" });
    expect(e.lines.find((l) => l.id === main.id)!.prov.quantity!.original!.value).toBe(1.6);
  });
});
