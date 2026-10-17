import { describe, expect, it } from "vitest";
import { cadFixture } from "./fixtures";
import { parseCadText } from "@/lib/cad/cadParser";
import type { PdfText, TextItem } from "@/lib/cad/pdfText";

function pdfFromLines(lines: string[]): PdfText {
  const items: TextItem[] = lines.map((str, i) => ({ str, x: 20, y: 20 + i * 14, w: 300, h: 10, page: 1, rotated: false, order: i }));
  return { pageCount: 1, pages: [{ width: 800, height: 600, items }] };
}

describe("CAD extraction – supplied CAD (style 72232)", () => {
  it("extracts the header values", async () => {
    const d = await cadFixture();
    expect(d.styleNumber.value).toBe("72232");
    expect(d.sets.value).toBe(5);
    expect(d.sizeBreakdown.value).toEqual([
      { size: "S", qty: 1 }, { size: "M", qty: 1 }, { size: "L", qty: 1 }, { size: "XL", qty: 1 }, { size: "XXL", qty: 1 },
    ]);
    expect(d.length).toMatchObject({ value: 3.87, unit: "m" });
    expect(d.width).toMatchObject({ value: 53, unit: "inch" });
    expect(d.efficiency).toMatchObject({ value: 68.47, unit: "%" });
    expect(d.lengthPerSet).toMatchObject({ value: 0.77, unit: "m" });
    expect(d.surfacePiecesCount.value).toBe(10);
    expect(d.totalPieces.value).toBe(10);
    expect(d.date.value).toBe("2026-09-19");
    expect(d.pieceNames).toEqual(["FRONT BLOCK CUT 2"]);
  });

  it("flags the ambiguous Total Length instead of interpreting it", async () => {
    const d = await cadFixture();
    expect(d.totalLength.value).toBe(152.54); // as printed
    expect(d.totalLength.requiresVerification).toBe(true);
    expect(d.totalLength.confidence).toBeLessThan(0.5);
    expect(d.totalLength.notes.join(" ")).toMatch(/INCHES/);
    expect(d.warnings.join(" ")).toMatch(/Total Length 152.54 m/);
  });

  it("confident values do not require verification; consumption is consistent with Length ÷ Sets", async () => {
    const d = await cadFixture();
    for (const f of [d.styleNumber, d.length, d.width, d.efficiency, d.lengthPerSet, d.totalPieces]) expect(f.requiresVerification).toBe(false);
    expect(d.lengthPerSet.notes.join(" ")).toMatch(/Consistent/);
  });
});

describe("CAD extraction – other layouts", () => {
  it("handles different order, separators and units", () => {
    const d = parseCadText(
      pdfFromLines(["ARTICLE NO: AB-1042", "Marker Width 140 cm", "Marker Length 4.2 m", "Sets 3,S/1,M/1,L/1", "Efficiency 81.2", "Length / Set 1.40 m", "Total Pieces 12"]),
    );
    expect(d.styleNumber.value).toBe("AB-1042");
    expect(d.width.value).toBeCloseTo(55.1181, 3); // converted from cm
    expect(d.width.notes.join(" ")).toMatch(/Converted/);
    expect(d.length.value).toBe(4.2);
    expect(d.sets.value).toBe(3);
    expect(d.efficiency.requiresVerification).toBe(true); // no % sign printed
    expect(d.lengthPerSet.value).toBe(1.4);
    expect(d.totalPieces.value).toBe(12);
  });

  it("derives Length per Set only as an unconfirmed suggestion", () => {
    const d = parseCadText(pdfFromLines(["Style: 555; Sets: 4; Length: 6.0m; Width: 58inch;"]));
    expect(d.lengthPerSet.value).toBe(1.5);
    expect(d.lengthPerSet.requiresVerification).toBe(true);
    expect(d.lengthPerSet.raw).toMatch(/derived/);
  });

  it("flags inconsistent values and missing unit", () => {
    const d = parseCadText(pdfFromLines(["Style Name: #1;", "Sets: 5;", "Length: 3.87;", "Length per Set: 0.50m;", "Total pieces: 10; Surface's Pieces Count: 8;"]));
    expect(d.length.requiresVerification).toBe(true);
    expect(d.lengthPerSet.requiresVerification).toBe(true);
    expect(d.totalPieces.requiresVerification).toBe(true);
    expect(d.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("never guesses when the PDF has no text layer", () => {
    const d = parseCadText({ pageCount: 1, pages: [{ width: 1, height: 1, items: [] }] });
    expect(d.lengthPerSet.value).toBeNull();
    expect(d.styleNumber.value).toBeNull();
    expect(d.lengthPerSet.requiresVerification).toBe(true);
    expect(d.warnings.join(" ")).toMatch(/no text layer/i);
  });
});
