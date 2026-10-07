import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseClientWorkbook, type ParsedClientSheet } from "@/lib/parsers/clientCostingParser";
import { buildClientTemplate } from "@/lib/parsers/templateBuilder";
import { calculateClientCost, createFromTemplate, setLineField } from "@/lib/calculations";
import { exportExcel } from "@/lib/export/documents";
import { DEFAULT_RULES } from "@/data/defaultRules";
import { explainCosting } from "@/lib/calculations/explain";
import type { ClientCosting } from "@/types/costing";
import { clientFixture, close, sourcePath } from "./fixtures";

/**
 * Per-customer client layouts. YOUSTA (YAS…) differs from the original GET layout: Print/Emb/Washing header, single CM amount row,
 * no finance / transport rows ("FINAL PO PRICE NON-MSME VENDOR"), vendor/brand block, its own default rows.
 */
const yas = async (file: string): Promise<ParsedClientSheet> => {
  const p = await parseClientWorkbook(fs.readFileSync(file), path.basename(file), () => new Date("2026-01-01T00:00:00Z"));
  return p.sheets[0];
};
/** the sheet's rows that are structure (stray unnamed value rows are not in the template) */
const structural = (s: ParsedClientSheet) => s.doc.lines.filter((l) => l.item || l.description || l.calc !== "QTY_X_RATE");
const YOUSTA_REF = sourcePath("client_costing_YOUSTA.xlsx");
const YAS_72300 = path.resolve(__dirname, "fixtures", "yas_72300.xlsx");
const YOUSTA = { key: "YOUSTA", label: "YOUSTA" };

describe("YOUSTA layout: reading the customer's own sheet", () => {
  it("reproduces Total, Total Cost and the final price of the supplied sheets", async () => {
    for (const [file, total, totalCost] of [[YOUSTA_REF, 98.54, 113.8356], [YAS_72300, 275.28, 315.3216]] as const) {
      const s = await yas(file);
      const r = calculateClientCost(s.doc);
      expect(r.total.base, file).toBeCloseTo(total, 2);
      expect(close(r.totalCost.base, s.cached.totalCost), file).toBe(true);
      expect(close(r.total.base, s.cached.total), file).toBe(true);
      expect(close(r.finalPoPrice, s.cached.finalPoPrice), file).toBe(true);
      expect(close(r.totalCost.withGst, s.cached.totalCostWithGst), file).toBe(true);
      expect(r.totalCost.base).toBeCloseTo(totalCost, 2);
    }
  });

  it("recognises the layout: no finance / transport rows, own final-price label, single CM amount row, header block", async () => {
    const s = await yas(YOUSTA_REF);
    expect(s.doc.client.pricing).toEqual({ finalPriceLabel: "FINAL PO PRICE NON-MSME VENDOR", finance: false, transport: false });
    expect(s.doc.client.sections.map((x) => `${x.label}:${x.phase}`)).toEqual([
      "Fabric:MAIN", "Sewing trims:MAIN", "Label & Tags:MAIN", "Packing Trims:MAIN", "Print/Emb/Washing:MAIN", "CM:MAIN",
      "Testing:POST_TOTAL", "Garment Rejection:POST_TOTAL", "Overhead+Margin:POST_TOTAL",
    ]);
    const cm = s.doc.lines.find((l) => l.sectionKey === "cm")!;
    expect(cm).toMatchObject({ calc: "ENTERED_AMOUNT", amount: 75, item: "CM" });
    expect(s.doc.issues.map((i) => i.code)).not.toEqual(expect.arrayContaining(["FINANCE_MISSING", "TRANSPORT_MISSING", "TOTAL_ROW_MISSING"]));
    expect(s.updateSheet).toBe(true);
    expect(s.headerLabels.H).toBe("qty UOM");
  });

  it("skips the one-row 'excel update' sheet without reporting an error", async () => {
    const p = await parseClientWorkbook(fs.readFileSync(YOUSTA_REF), "yas.xlsx");
    expect(p.sheets).toHaveLength(1);
    expect(p.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(p.issues.map((i) => i.code)).toContain("SHEET_SKIPPED");
  });

  it("the original GET layout is unchanged (finance + transport chain, no pricing override)", async () => {
    const s = (await clientFixture()).sheets[0];
    expect(s.doc.client.pricing).toBeUndefined();
    expect(s.doc.lines.some((l) => l.calc === "ENTERED_AMOUNT")).toBe(false);
  });
});

describe("YOUSTA default template", () => {
  it("has every YOUSTA header and row, no values, keeps GST/UOM and the fixed 2% / 12% as flagged template defaults", async () => {
    const t = buildClientTemplate(await yas(YOUSTA_REF), "client_costing_YOUSTA.xlsx", YOUSTA);
    expect(t.client.format).toMatchObject({ key: "YOUSTA", label: "YOUSTA", export: { sheetName: "revised format", updateSheet: true } });
    expect(t.client.sections).toHaveLength(9);
    const items = (key: string) => t.lines.filter((l) => l.sectionKey === key).map((l) => l.item);
    expect(items("sewing_trims")).toEqual(expect.arrayContaining(["Sewing Thread", "MOP Buttons", "Shank/Snap", "Rivets", "Eyelet", "Adjustable elastic", "Zipper"]));
    expect(items("label_and_tags")).toEqual(expect.arrayContaining(["Main Label", "Main tag", "Disclaimer Tag", "Barcode", "Transparent Tag"]));
    expect(items("packing_trims")).toEqual(expect.arrayContaining(["Carton", "Divider", "Gum Tape"]));
    expect(items("print_emb_washing")).toEqual(expect.arrayContaining(["Print", "Emb", "Washing"]));
    expect(items("cm")).toEqual(["CM"]);
    expect(t.lines.find((l) => l.sectionKey === "cm")!.calc).toBe("ENTERED_AMOUNT");
    expect(t.lines.every((l) => l.quantity === null && (l.amount ?? null) === null)).toBe(true);
    // nothing but the fixed percentages carries a rate
    expect(t.lines.filter((l) => l.rate !== null).map((l) => [l.item, l.rate, l.prov.rate?.origin])).toEqual([["Garment Rejection", 0.02, "TEMPLATE"], ["Overhead+Margin", 0.12, "TEMPLATE"]]);
    expect(t.lines.find((l) => l.item === "Sewing Thread")!.gstRate).toBe(0.12);
    expect(t.client.headerNotes).toEqual(expect.arrayContaining(["BRAND - YOUSTA", "Vendor Code - 32026735"]));
    expect(JSON.stringify(t)).not.toMatch(/YAS26|92% Cotton/);
  });

  it("a new style starts from it: all rows present, defaults flagged TEMPLATE, nothing priced", async () => {
    const t = buildClientTemplate(await yas(YOUSTA_REF), "client_costing_YOUSTA.xlsx", YOUSTA);
    const d = createFromTemplate(t, { number: "72232" }, "STRUCTURE");
    expect(d.lines).toHaveLength(t.lines.length);
    expect(d.client.format?.key).toBe("YOUSTA");
    expect(d.client.pricing?.finance).toBe(false);
    expect(d.client.headerNotes).toEqual(t.client.headerNotes);
    expect(d.lines.find((l) => l.item === "Overhead+Margin")).toMatchObject({ rate: 0.12, prov: { rate: { origin: "TEMPLATE" } } });
    expect(calculateClientCost(d).totalCost.base).toBe(0);
  });

  it("values entered in the engine reproduce the customer's own totals (2 real styles)", async () => {
    for (const file of [YOUSTA_REF, YAS_72300]) {
      const s = await yas(file);
      const t = buildClientTemplate(s, path.basename(file), YOUSTA);
      let d = createFromTemplate(t, { number: "X" }, "STRUCTURE") as ClientCosting;
      // template lines are 1:1 with the sheet's lines; type the sheet's quantities / rates / amounts / GST in
      structural(s).forEach((src, i) => {
        const id = d.lines[i].id;
        expect(d.lines[i].item).toBe(src.item);
        if (src.calc === "ENTERED_AMOUNT") d = setLineField(d, id, "amount", src.amount ?? null, { by: "t" });
        else {
          if (src.quantity !== null) d = setLineField(d, id, "quantity", src.quantity, { by: "t" });
          if (src.rate !== null) d = setLineField(d, id, "rate", src.rate, { by: "t" });
        }
        if (src.gstRate !== null) d = setLineField(d, id, "gstRate", src.gstRate, { by: "t" });
      });
      const r = calculateClientCost(d);
      expect(close(r.total.base, s.cached.total), file).toBe(true);
      expect(close(r.totalCost.base, s.cached.totalCost), file).toBe(true);
      expect(close(r.totalCost.withGst, s.cached.totalCostWithGst), file).toBe(true);
      expect(close(r.finalPoPrice, s.cached.finalPoPrice), file).toBe(true);
    }
  });

  it("the calculation chain ends at the layout's own final price (no FOB / finance / transport steps)", async () => {
    const s = await yas(YOUSTA_REF);
    const labels = explainCosting(s.doc, calculateClientCost(s.doc)).map((x) => x.label);
    expect(labels).toContain("FINAL PO PRICE NON-MSME VENDOR");
    expect(labels).not.toContain("FINANCE COST");
    expect(labels).not.toContain("Transport");
  });
});

describe("YOUSTA Excel output", () => {
  const input = async () => {
    const s = await yas(YOUSTA_REF);
    const t = buildClientTemplate(s, "client_costing_YOUSTA.xlsx", YOUSTA);
    let d = createFromTemplate(t, { number: "72232" }, "STRUCTURE") as ClientCosting;
    structural(s).forEach((src, i) => {
      const id = d.lines[i].id;
      if (src.calc === "ENTERED_AMOUNT") d = setLineField(d, id, "amount", src.amount ?? null, { by: "t" });
      else {
        if (src.quantity !== null) d = setLineField(d, id, "quantity", src.quantity, { by: "t" });
        if (src.rate !== null) d = setLineField(d, id, "rate", src.rate, { by: "t" });
      }
    });
    // typed per style
    const main = d.lines.find((l) => l.item === "Main Fabric")!;
    d = setLineField(d, main.id, "description", "92% Cotton, 8% Flex", { by: "t" });
    d = setLineField(d, main.id, "rate", 120, { by: "t" });
    d = setLineField(d, main.id, "quantity", 1.5, { by: "t" });
    d.style = { ...d.style, productId: "YAS26ZWEWYF72232" };
    return { doc: d, style: { number: "72232" }, user: "t", rules: DEFAULT_RULES, at: new Date("2026-01-01T00:00:00Z") };
  };
  const load = async (i: Awaited<ReturnType<typeof input>>) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await exportExcel(i)) as unknown as ArrayBuffer);
    return wb;
  };

  it("writes the customer's sheet (own name, wording, vendor block, CM amount, final-price row) with live formulas", async () => {
    const i = await input();
    const wb = await load(i);
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(["revised format", "excel update", "Summary", "Provenance"]));
    expect(wb.getWorksheet("Client Costing")).toBeUndefined();
    const ws = wb.getWorksheet("revised format")!;
    expect(ws.getCell("H1").value).toBe("qty UOM");
    expect(String(ws.getCell("E1").value)).toMatch(/^Fabric\s+Quality Description/);
    expect(ws.getCell("A2").value).toBe("YAS26ZWEWYF72232");
    const colA = Array.from({ length: 12 }, (_, k) => String(ws.getCell(3 + k, 1).value ?? ""));
    expect(colA).toEqual(expect.arrayContaining(["BRAND - YOUSTA", "Vendor Code - 32026735"]));

    const res = calculateClientCost(i.doc);
    let cm = 0, final = 0, totalCost = 0;
    ws.eachRow((row, n) => {
      if (String(row.getCell(3).value ?? "") === "CM") cm = n;
      if (String(row.getCell(9).value ?? "") === "FINAL PO PRICE NON-MSME VENDOR") final = n;
      if (String(row.getCell(5).value ?? "") === "Total Cost") totalCost = n;
    });
    expect(cm).toBeGreaterThan(0);
    expect(ws.getCell(`K${cm}`).value).toBe(75);
    expect((ws.getCell(`L${cm}`).value as unknown as { formula: string }).formula).toBe(`K${cm}`);
    expect(final).toBeGreaterThan(totalCost);
    const fv = ws.getCell(`L${final}`).value as unknown as { formula: string; result: number };
    expect(fv.formula).toBe(`L${totalCost}`);
    expect(fv.result).toBeCloseTo(res.finalPoPrice, 9);
    expect((ws.getCell(`L${totalCost}`).value as unknown as { result: number }).result).toBeCloseTo(res.totalCost.base, 9);
    // no GET-only rows
    expect(JSON.stringify(ws.getSheetValues())).not.toMatch(/FINANCE COST|FOB Price|Transport/);
  });

  it("writes the customer's 'excel update' row linked to the costing sheet", async () => {
    const i = await input();
    const wb = await load(i);
    const up = wb.getWorksheet("excel update")!;
    expect(up.getCell("E3").value).toBe("NON MSME CS price");
    expect(up.getCell("B4").value).toBe("YOUSTA");
    expect(up.getCell("X4").value).toBe("UNITED TEXTILE MILL PVT LTD");
    expect(up.getCell("Y4").value).toBe("32026735");
    const f = (a: string) => up.getCell(a).value as unknown as { formula: string; result: unknown };
    const res = calculateClientCost(i.doc);
    expect(f("E4").formula).toMatch(/^'revised format'!L\d+$/);
    expect(f("E4").result as number).toBeCloseTo(res.finalPoPrice, 9);
    expect(f("C4")).toMatchObject({ formula: "'revised format'!A2", result: "YAS26ZWEWYF72232" });
    expect(f("G4").result).toBe(0.12);
    expect(f("H4").result).toBe(0.02);
    expect(f("I4").result).toBe(75);
    expect(f("J4").result).toBe("92% Cotton, 8% Flex");
    expect(f("K4").result).toBe(120);
    expect(f("L4").result).toBe(1.5);
    // the formulas address the real rows of the costing sheet
    const ws = wb.getWorksheet("revised format")!;
    const mainRow = Number(f("K4").formula.match(/K(\d+)$/)![1]);
    expect(String(ws.getCell(`D${mainRow}`).value)).toBe("Main Fabric");
  });

  it("the original layout keeps its sheet name and its finance / transport chain", async () => {
    const s = (await clientFixture()).sheets[0];
    const d = createFromTemplate(buildClientTemplate(s), { number: "5008" }, "STRUCTURE") as ClientCosting;
    const wb = await load({ doc: d, style: { number: "5008" }, user: "t", rules: DEFAULT_RULES, at: new Date("2026-01-01T00:00:00Z") });
    expect(wb.getWorksheet("Client Costing")).toBeDefined();
    expect(wb.getWorksheet("excel update")).toBeUndefined();
    expect(JSON.stringify(wb.getWorksheet("Client Costing")!.getSheetValues())).toMatch(/FINAL PO PRICE Incl Transport/);
  });
});
