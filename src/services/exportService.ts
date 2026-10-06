import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import path from "node:path";
import fs from "node:fs";
import type { ActualCosting, ActualResult, CadData, ClientCosting, ClientResult, CostLine, CostingDoc } from "@/types/costing";
import { calculateActualCost, calculateClientCost, cadEffective, compareCostings, explainCosting, ENGINE_VERSION, listOverrides, type ComparisonResult } from "@/lib/calculations";
import type { RuleSet } from "@/types/rules";

export const COMPANY = "UNITED TEXTILE MILLS";

export interface ExportInput {
  doc: CostingDoc;
  style: { number: string; color?: string | null };
  customer?: string | null;
  brand?: string | null;
  category?: string | null;
  versionNo?: number | null;
  unsaved?: boolean;
  user: string;
  cad?: CadData | null;
  image?: { bytes: Buffer; mime: string } | null;
  /** the costing of the other type for the same style (or an explicit, flagged pairing) */
  other?: { doc: CostingDoc; paired: boolean; label?: string } | null;
  rules: RuleSet;
  at?: Date;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : inr.format(v));
const rupee = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v < 0 ? "-" : ""}₹${inr.format(Math.abs(v))}`);
const q4 = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(parseFloat(v.toFixed(4))));
const label = (l: CostLine) => l.item || l.description || l.sectionLabel;

function comparisonFor(i: ExportInput): ComparisonResult | null {
  if (!i.other) return null;
  const a = (i.doc.type === "ACTUAL" ? i.doc : i.other.doc) as ActualCosting;
  const c = (i.doc.type === "CLIENT" ? i.doc : i.other.doc) as ClientCosting;
  if (a.type !== "ACTUAL" || c.type !== "CLIENT") return null;
  return compareCostings(a, calculateActualCost(a), c, calculateClientCost(c), i.rules);
}

/* ═══════════════════════════ EXCEL ═══════════════════════════ */

const HEAD_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D3557" } };
const SECTION_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F7" } };
const NUM = "#,##0.00";

export async function exportExcel(i: ExportInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = i.user;
  wb.created = i.at ?? new Date();
  wb.title = `${i.style.number} ${i.doc.type} costing`;

  summarySheet(wb, i);
  if (i.doc.type === "CLIENT") clientSheet(wb, i.doc, calculateClientCost(i.doc));
  else actualSheet(wb, i.doc, calculateActualCost(i.doc));
  const cmp = comparisonFor(i);
  if (cmp) comparisonSheet(wb, cmp, i);
  provenanceSheet(wb, i.doc);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function summarySheet(wb: ExcelJS.Workbook, i: ExportInput) {
  const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 26 }, { width: 44 }, { width: 4 }, { width: 26 }, { width: 30 }];
  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = COMPANY;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1D3557" } };
  ws.mergeCells("A2:E2");
  ws.getCell("A2").value = `${i.doc.type === "ACTUAL" ? "Actual" : "Client"} Costing`;
  ws.getCell("A2").font = { size: 11, color: { argb: "FF667085" } };
  const meta: Array<[string, string]> = [
    ["Customer", i.customer ?? "—"],
    ["Brand", i.brand ?? "—"],
    ["Style number", i.style.number],
    ["Colour", i.style.color ?? "—"],
    ["Category", i.category ?? (i.doc.type === "CLIENT" ? i.doc.client.category ?? "—" : "—")],
    ["Costing type", i.doc.type === "ACTUAL" ? "ACTUAL COSTING" : "CLIENT COSTING"],
    ["Version", `${i.versionNo ? "v" + i.versionNo : "—"}${i.unsaved ? " (+ unsaved changes)" : ""}`],
    ["Exported", (i.at ?? new Date()).toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    ["Exported by", i.user],
    ["Engine", `Cost Engine ${ENGINE_VERSION}`],
  ];
  meta.forEach(([k, v], idx) => {
    const r = 4 + idx;
    ws.getCell(r, 1).value = k.toUpperCase();
    ws.getCell(r, 1).font = { bold: true, size: 9, color: { argb: "FF667085" } };
    ws.getCell(r, 2).value = v;
  });
  const result = i.doc.type === "ACTUAL" ? calculateActualCost(i.doc) : calculateClientCost(i.doc);
  const kr = 4;
  const key: Array<[string, string]> =
    result.type === "ACTUAL"
      ? [["Total Cost", rupee(result.totalCost)], ["Cost per pc", rupee(result.costPerPc)], ["Per pc profit", rupee(result.perPcProfit)], ["Total value loss", rupee(result.totalValueLoss)]]
      : [["Total Cost (FOB Price)", rupee(result.fobPrice)], ["FINAL PO PRICE", rupee(result.finalPoPrice)], ["Transport", rupee(result.transport)], ["FINAL PO PRICE Incl Transport", rupee(result.finalPoPriceInclTransport)]];
  key.forEach(([k, v], idx) => {
    ws.getCell(kr + idx, 4).value = k.toUpperCase();
    ws.getCell(kr + idx, 4).font = { bold: true, size: 9, color: { argb: "FF667085" } };
    ws.getCell(kr + idx, 5).value = v;
    ws.getCell(kr + idx, 5).font = { bold: true, size: 12 };
  });
  let row = 4 + meta.length + 1;
  if (i.cad) {
    ws.getCell(row, 1).value = "CAD DATA";
    ws.getCell(row, 1).font = { bold: true, color: { argb: "FF1D3557" } };
    row++;
    const c = i.cad;
    const fmt = (f: { value: unknown; manual?: { value: unknown }; requiresVerification: boolean }, u = "") => {
      const v = f.manual ? f.manual.value : f.value;
      return v === null || v === undefined ? "not found" : `${v}${u}${f.manual ? " (manually set; extracted " + (f.value ?? "none") + ")" : f.requiresVerification ? "  ⚠ verify" : ""}`;
    };
    const rows: Array<[string, string]> = [
      ["Style Number", fmt(c.styleNumber)],
      ["Length", fmt(c.length, " m")],
      ["Width", fmt(c.width, '"')],
      ["Efficiency", fmt(c.efficiency, "%")],
      ["Length / Set", fmt(c.lengthPerSet, " m")],
      ["Total Pieces", fmt(c.totalPieces)],
      ["Total Length (as printed)", fmt(c.totalLength, " m")],
    ];
    for (const [k, v] of rows) {
      ws.getCell(row, 1).value = k;
      ws.getCell(row, 2).value = v;
      row++;
    }
  }
  if (i.image && /png|jpe?g/.test(i.image.mime)) {
    const id = wb.addImage({ buffer: i.image.bytes as unknown as ExcelJS.Buffer, extension: /png/.test(i.image.mime) ? "png" : "jpeg" });
    ws.addImage(id, { tl: { col: 3.2, row: 9 }, ext: { width: 220, height: 293 } });
  }
}

function styleCell(c: ExcelJS.Cell, o: { bold?: boolean; fill?: ExcelJS.Fill; fmt?: string }) {
  if (o.bold) c.font = { bold: true };
  if (o.fill) c.fill = o.fill;
  if (o.fmt) c.numFmt = o.fmt;
}

function clientSheet(wb: ExcelJS.Workbook, doc: ClientCosting, res: ClientResult) {
  const ws = wb.addWorksheet("Client Costing", { views: [{ state: "frozen", ySplit: 1 }] });
  // Same column positions as client costing.xlsx (A–X)
  const heads = ["Product ID", "Design ID", "Cost Item category", "Cost Item", "Description", "Item Type", "Quantity", "Quantity UOM", "HS Code", "Duty%", "Price without GST", "Base Total(W/o GST Factor)", " Base Total(With GST)", "GST", "Input Cost(on Base cost w/o GST factor)", "Currency", "Fabric Type", "Fabric Finish", "Fabric Construction & Content W/ Percentage", "Knit Gauge", "Cuttable Width", "Source", "Costing Scenario", "Action"];
  const widths = [28, 12, 18, 28, 36, 9, 10, 10, 9, 8, 14, 16, 16, 7, 16, 9, 12, 12, 24, 10, 12, 10, 14, 8];
  ws.columns = widths.map((w) => ({ width: w }));
  const hr = ws.getRow(1);
  heads.forEach((h, k) => {
    const c = hr.getCell(k + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = HEAD_FILL;
    c.alignment = { wrapText: true, vertical: "middle" };
  });
  hr.height = 32;

  const live = doc.lines.filter((l) => !l.removed);
  const phase = (l: CostLine) => doc.client.sections.find((s) => s.key === l.sectionKey)?.phase ?? "MAIN";
  const main = live.filter((l) => phase(l) === "MAIN");
  const post = live.filter((l) => phase(l) === "POST_TOTAL");
  let r = 2;
  const firstRow = r;
  const totalRowIndex = firstRow + main.length; // row of "Total"
  const writeLine = (l: CostLine, first: boolean) => {
    const row = ws.getRow(r);
    const lr = res.lineResults[l.id];
    if (first) row.getCell(1).value = doc.style.productId ?? doc.style.label;
    row.getCell(3).value = l.sectionLabel;
    row.getCell(4).value = l.item || null;
    row.getCell(5).value = l.description || null;
    row.getCell(6).value = l.itemType;
    if (l.calc !== "PERCENT_OF_SUBTOTAL") {
      row.getCell(7).value = l.quantity;
      row.getCell(8).value = l.uom;
    } else row.getCell(7).value = l.quantity;
    row.getCell(9).value = (l.attributes.hsCode as string) ?? null;
    row.getCell(10).value = (l.attributes.duty as string | number) ?? null;
    row.getCell(11).value = l.rate;
    if (l.calc === "PERCENT_OF_SUBTOTAL") row.getCell(12).value = { formula: `L${totalRowIndex}*K${r}`, result: lr.base };
    else if (l.calc === "ENTERED_AMOUNT") row.getCell(12).value = l.amount ?? 0;
    else row.getCell(12).value = { formula: `G${r}*K${r}`, result: lr.base };
    row.getCell(14).value = l.gstRate;
    row.getCell(15).value = { formula: `L${r}*N${r}`, result: lr.gst };
    row.getCell(13).value = { formula: `L${r}+O${r}`, result: lr.withGst };
    row.getCell(16).value = l.currency;
    row.getCell(17).value = (l.attributes.fabricType as string) ?? null;
    row.getCell(18).value = (l.attributes.fabricFinish as string) ?? null;
    row.getCell(19).value = (l.attributes.construction as string) ?? null;
    row.getCell(20).value = (l.attributes.knitGauge as string | number) ?? null;
    row.getCell(21).value = (l.attributes.cuttableWidth as string) ?? null;
    row.getCell(22).value = (l.attributes.source as string) ?? null;
    row.getCell(23).value = (l.attributes.costingScenario as string) ?? null;
    row.getCell(24).value = (l.attributes.action as string) ?? null;
    for (const c of [11, 12, 13, 15]) row.getCell(c).numFmt = NUM;
    row.getCell(14).numFmt = "0%";
    if (l.calc === "PERCENT_OF_SUBTOTAL") row.getCell(11).numFmt = "0.0%";
    r++;
  };
  main.forEach((l, k) => writeLine(l, k === 0));
  // Total
  const tr = ws.getRow(r);
  tr.getCell(5).value = "Total";
  tr.getCell(12).value = { formula: `SUM(L${firstRow}:L${r - 1})`, result: res.total.base };
  tr.getCell(13).value = { formula: `SUM(M${firstRow}:M${r - 1})`, result: res.total.withGst };
  tr.eachCell({ includeEmpty: true }, (c) => styleCell(c, { bold: true, fill: TOTAL_FILL }));
  for (const c of [12, 13]) tr.getCell(c).numFmt = NUM;
  const totalR = r;
  r++;
  post.forEach((l) => writeLine(l, false));
  const tcr = ws.getRow(r);
  tcr.getCell(5).value = "Total Cost";
  tcr.getCell(12).value = { formula: `SUM(L${totalR}:L${r - 1})`, result: res.totalCost.base };
  tcr.getCell(13).value = { formula: `SUM(M${totalR}:M${r - 1})`, result: res.totalCost.withGst };
  tcr.getCell(15).value = { formula: `SUM(O${firstRow}:O${r - 1})`, result: res.totalCost.gst };
  tcr.eachCell({ includeEmpty: true }, (c) => styleCell(c, { bold: true, fill: SECTION_FILL }));
  for (const c of [12, 13, 15]) tcr.getCell(c).numFmt = NUM;
  const costR = r;
  r += 2;
  const put = (labelText: string, formulaOrValue: string | number, result: number, bold = false) => {
    const row = ws.getRow(r);
    row.getCell(9).value = labelText;
    row.getCell(12).value = typeof formulaOrValue === "string" ? { formula: formulaOrValue, result } : formulaOrValue;
    row.getCell(12).numFmt = NUM;
    if (bold) {
      row.getCell(9).font = { bold: true };
      row.getCell(12).font = { bold: true };
    }
    r++;
    return r - 1;
  };
  const fob = put("FOB Price", `L${costR}`, res.fobPrice, true);
  const finLabel = doc.client.finance.referenceRate !== null ? `FINANCE COST ${(doc.client.finance.referenceRate * 100).toFixed(0)}% (factor applied: ${doc.client.finance.rate})` : "FINANCE COST";
  const fin = put(finLabel, `L${fob}*${doc.client.finance.rate}`, res.financeCost);
  const fin2 = put("FINAL PO PRICE", `L${fob}-L${fin}`, res.finalPoPrice, true);
  const tp = put("Transport", doc.client.transport.amount, res.transport);
  put("FINAL PO PRICE Incl Transport", `L${fin2}+L${tp}`, res.finalPoPriceInclTransport, true);
  if (doc.client.headerNotes.length) {
    r++;
    ws.getCell(r, 1).value = "Product notes: " + doc.client.headerNotes.join(" | ");
    ws.getCell(r, 1).font = { italic: true, color: { argb: "FF667085" } };
  }
}

function actualSheet(wb: ExcelJS.Workbook, doc: ActualCosting, res: ActualResult) {
  const ws = wb.addWorksheet("Actual Costing", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [{ width: 34 }, { width: 12 }, { width: 12 }, { width: 16 }, { width: 18 }, { width: 3 }, { width: 40 }];
  const a = doc.actual;
  const h = ws.getRow(1);
  [doc.style.label || doc.style.number, "QTY", "RATE", "SALE", "PURCHASE"].forEach((t, k) => {
    const c = h.getCell(k + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEAD_FILL;
  });
  ws.getRow(2).values = ["ORDER PCS", a.orderPcs.qty, a.orderPcs.rate, { formula: "C2*B2", result: res.orderSale }];
  ws.getRow(3).values = ["DISPATCH PCS", a.dispatchPcs.qty, a.dispatchPcs.rate, { formula: "C3*B3", result: res.dispatchSale }];
  let r = 5;
  const heading = (t: string) => {
    const row = ws.getRow(r++);
    row.getCell(1).value = t;
    row.eachCell({ includeEmpty: true }, (c) => styleCell(c, { bold: true, fill: SECTION_FILL }));
  };
  const lines = (key: string) => doc.lines.filter((l) => l.sectionKey === key && !l.removed);
  const writeLines = (key: string) => {
    const from = r;
    for (const l of lines(key)) {
      const row = ws.getRow(r);
      row.getCell(1).value = label(l);
      if (l.calc === "ENTERED_AMOUNT") row.getCell(5).value = l.amount ?? 0;
      else {
        row.getCell(2).value = l.quantity;
        row.getCell(3).value = l.rate;
        row.getCell(5).value = { formula: `C${r}*B${r}`, result: res.lineTotals[l.id] };
      }
      if (l.description) row.getCell(7).value = l.description;
      row.getCell(5).numFmt = NUM;
      r++;
    }
    return { from, to: r - 1 };
  };
  heading("FABRIC ORDER");
  ws.getRow(r).values = ["CONSUMPTION", a.consumption.value];
  r++;
  const fab = writeLines("FABRIC_ORDER");
  const fabTotal = r;
  ws.getRow(r).values = ["Total fabric cost", null, null, null, { formula: fab.to >= fab.from ? `SUM(E${fab.from}:E${fab.to})` : "0", result: res.totalFabricCost }];
  ws.getRow(r).eachCell((c) => styleCell(c, { bold: true, fill: TOTAL_FILL, fmt: NUM }));
  r += 2;
  const cmt = writeLines("CMT");
  const cmtRef = cmt.to >= cmt.from ? `SUM(E${cmt.from}:E${cmt.to})` : "0";
  r++;
  heading("TRIMS");
  const trims = writeLines("TRIMS");
  const trimsTotal = r;
  ws.getRow(r).values = ["total trims cost", null, null, null, { formula: trims.to >= trims.from ? `SUM(E${trims.from}:E${trims.to})` : "0", result: res.totalTrimsCost }];
  ws.getRow(r).eachCell((c) => styleCell(c, { bold: true, fill: TOTAL_FILL, fmt: NUM }));
  r++;
  heading("LD CHARGES");
  const ld = writeLines("LD_CHARGES");
  const ldRef = ld.to >= ld.from ? `SUM(E${ld.from}:E${ld.to})` : "0";
  const tcRow = r;
  ws.getRow(r).values = ["Total Cost", null, null, null, { formula: `E${trimsTotal}+E${fabTotal}+${cmtRef}+${ldRef}-${a.deduction}`, result: res.totalCost }];
  ws.getRow(r).eachCell((c) => styleCell(c, { bold: true, fill: SECTION_FILL, fmt: NUM }));
  r++;
  ws.getRow(r).values = ["Cost per pc", null, null, null, res.costPerPc === null ? null : { formula: `E${tcRow}/B3`, result: res.costPerPc }];
  const cpp = r;
  r++;
  ws.getRow(r).values = ["PROFIT", null, null, null, { formula: `D3-E${tcRow}`, result: res.profit }];
  r++;
  ws.getRow(r).values = ["PER PC PROFIT", null, "profit %", res.profitPct, res.perPcProfit === null ? null : { formula: `C3-E${cpp}`, result: res.perPcProfit }];
  r += 2;
  heading("REJECT");
  const rej = writeLines("REJECT");
  ws.getRow(r).values = ["Total Value Loss", null, null, null, { formula: rej.to >= rej.from ? `SUM(E${rej.from}:E${rej.to})` : "0", result: res.totalValueLoss }];
  r++;
  ws.getRow(r).values = ["% value loss", null, null, res.valueLossPct, null];
  for (let k = 1; k <= r; k++) for (const c of [4, 5]) if (ws.getRow(k).getCell(c).numFmt === undefined) ws.getRow(k).getCell(c).numFmt = NUM;
  if (a.notes.length) {
    ws.getCell(2, 7).value = a.notes.join(" | ");
    ws.getCell(2, 7).font = { italic: true, color: { argb: "FF667085" } };
  }
}

function comparisonSheet(wb: ExcelJS.Workbook, cmp: ComparisonResult, i: ExportInput) {
  const ws = wb.addWorksheet("Comparison");
  ws.columns = [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.getCell("A1").value = `Actual vs Client — style ${i.style.number}`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  if (i.other?.paired) {
    ws.getCell("A2").value = `MANUAL PAIRING: ${i.other.label ?? "other costing"} – not the same style.`;
    ws.getCell("A2").font = { bold: true, color: { argb: "FFB45309" } };
  }
  const head = ["", "ACTUAL / pc", "CLIENT / pc", "DIFFERENCE / pc", "PREMIUM %", "ACTUAL total", "CLIENT total", "DIFFERENCE total"];
  head.forEach((t, k) => {
    const c = ws.getRow(4).getCell(k + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEAD_FILL;
  });
  let r = 5;
  for (const row of cmp.rows) {
    ws.getRow(r).values = [row.group, row.actualPerPc, row.clientPerPc, { formula: `C${r}-B${r}`, result: row.differencePerPc }, row.premiumPct === null ? null : row.premiumPct / 100, row.actualTotal, row.clientTotal, { formula: `G${r}-F${r}`, result: row.differenceTotal }];
    r++;
  }
  const t = cmp.totals;
  ws.getRow(r).values = ["TOTAL", t.actualPerPc, t.clientPerPc, t.differencePerPc, t.premiumPct === null ? null : t.premiumPct / 100, t.actualTotal, t.clientTotal, t.differenceTotal];
  ws.getRow(r).eachCell((c) => styleCell(c, { bold: true, fill: TOTAL_FILL }));
  for (let k = 5; k <= r; k++) {
    for (const c of [2, 3, 4, 6, 7, 8]) ws.getRow(k).getCell(c).numFmt = NUM;
    ws.getRow(k).getCell(5).numFmt = "0.0%";
  }
  r += 2;
  for (const n of cmp.notes) ws.getCell(r++, 1).value = n;
}

function provenanceSheet(wb: ExcelJS.Workbook, doc: CostingDoc) {
  const ws = wb.addWorksheet("Provenance");
  ws.columns = [{ width: 26 }, { width: 22 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 60 }];
  const head = ["Line", "Field", "Origin", "Value", "Original value", "Source / note"];
  head.forEach((t, k) => {
    const c = ws.getRow(1).getCell(k + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = HEAD_FILL;
  });
  let r = 2;
  const add = (l: string, f: string, origin: string, v: unknown, o: unknown, note: string) => {
    ws.getRow(r++).values = [l, f, origin, v as ExcelJS.CellValue, o as ExcelJS.CellValue, note];
  };
  if (doc.type === "ACTUAL" && doc.actual.consumption.prov) {
    const p = doc.actual.consumption.prov;
    add("CONSUMPTION", "consumption", p.origin, doc.actual.consumption.value, p.original?.value ?? null, [p.ref?.file, p.ref?.sheet, p.ref?.cell, p.ref?.note].filter(Boolean).join(" → "));
  }
  for (const l of doc.lines) {
    if (l.removed) add(label(l), "line", "REMOVED", null, null, "Removed from this costing (kept in history)");
    for (const [f, p] of Object.entries(l.prov)) {
      if (!p || p.origin === "IMPORT") continue;
      add(label(l), f, p.origin, (l as unknown as Record<string, unknown>)[f] as unknown, p.original?.value ?? null, [p.ref?.file, p.ref?.sheet, p.ref?.cell, p.ref?.note, p.reason && `“${p.reason}”`, p.by, p.at].filter(Boolean).join(" → "));
    }
  }
  if (r === 2) ws.getCell(2, 1).value = "All values come straight from the imported source; nothing was derived from CAD or overridden.";
  void listOverrides;
}

/* ═══════════════════════════ PDF ═══════════════════════════ */

const FONT = path.resolve(process.cwd(), "assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.resolve(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");
const INK = "#101828";
const MUTED = "#667085";
const ACCENT = "#1d3557";
const LINE = "#e4e7ec";

/** Photos from phones are multi-megabyte; downscale for documents (keeps exports small and fast). */
export async function downscaleImage(bytes: Buffer, mime: string, maxPx = 700): Promise<{ bytes: Buffer; mime: string }> {
  if (!/png|jpe?g|webp/.test(mime)) return { bytes, mime };
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(bytes);
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const canvas = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return { bytes: canvas.toBuffer("image/jpeg", 82), mime: "image/jpeg" };
  } catch {
    return { bytes, mime };
  }
}

export async function exportPdf(i: ExportInput): Promise<Buffer> {
  const landscape = i.doc.type === "CLIENT";
  const doc = new PDFDocument({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 34, bufferPages: true, info: { Title: `${i.style.number} ${i.doc.type} costing`, Author: i.user, Creator: `Cost Engine ${ENGINE_VERSION}` } });
  if (!fs.existsSync(FONT)) throw new Error("PDF fonts are missing (assets/fonts)");
  doc.registerFont("R", FONT);
  doc.registerFont("B", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const W = doc.page.width - 68;
  const left = 34;
  const bottomLimit = () => doc.page.height - 50;

  const hdr = () => {
    doc.rect(0, 0, doc.page.width, 6).fill(ACCENT);
  };
  hdr();
  doc.fillColor(ACCENT).font("B").fontSize(13).text(COMPANY, left, 24, { characterSpacing: 1.2 });
  doc.fillColor(MUTED).font("R").fontSize(9).text(`${i.doc.type === "ACTUAL" ? "ACTUAL" : "CLIENT"} COSTING SHEET${i.unsaved ? "  ·  DRAFT (unsaved changes)" : ""}`, left, 41);
  doc.fillColor(INK).font("B").fontSize(20).text(i.style.number, left, 56);
  if (i.style.color) doc.fillColor(MUTED).font("R").fontSize(10).text(i.style.color, left, 80);

  // meta grid
  const meta: Array<[string, string]> = [
    ["CUSTOMER", i.customer ?? "—"],
    ["BRAND", i.brand ?? "—"],
    ["CATEGORY", i.category ?? (i.doc.type === "CLIENT" ? i.doc.client.category ?? "—" : "—")],
    ["VERSION", i.versionNo ? `v${i.versionNo}` : "—"],
    ["DATE", (i.at ?? new Date()).toISOString().slice(0, 16).replace("T", " ") + " UTC"],
    ["PREPARED BY", i.user],
  ];
  const imgW = 92;
  const metaX = left + 270;
  const metaW = W - 270 - (i.image ? imgW + 14 : 0);
  meta.forEach(([k, v], idx) => {
    const col = idx % 3;
    const rowN = Math.floor(idx / 3);
    const x = metaX + col * (metaW / 3);
    const y = 26 + rowN * 30;
    doc.fillColor(MUTED).font("R").fontSize(7).text(k, x, y, { characterSpacing: 0.6 });
    doc.fillColor(INK).font("B").fontSize(9.5).text(v, x, y + 10, { width: metaW / 3 - 6, lineBreak: false, ellipsis: true });
  });
  if (i.image && /png|jpe?g/.test(i.image.mime)) {
    try {
      doc.image(i.image.bytes, left + W - imgW, 22, { fit: [imgW, 112], align: "right" });
    } catch {
      /* unreadable image: skip, never fail the export for it */
    }
  }
  let y = 142;

  // CAD summary
  if (i.cad) {
    const c = i.cad;
    const f = (x: { value: unknown; manual?: { value: unknown } }, u = "") => {
      const v = x.manual ? x.manual.value : x.value;
      return v === null || v === undefined ? "n/a" : `${typeof v === "number" ? parseFloat((v as number).toFixed(2)) : v}${u}`;
    };
    doc.roundedRect(left, y, W - (i.image ? imgW + 10 : 0), 38, 3).lineWidth(0.6).stroke(LINE);
    const items: Array<[string, string]> = [["CAD STYLE", f(c.styleNumber)], ["LENGTH", f(c.length, " m")], ["WIDTH", f(c.width, '"')], ["EFFICIENCY", f(c.efficiency, "%")], ["LENGTH / SET", f(c.lengthPerSet, " m")], ["TOTAL PIECES", f(c.totalPieces)]];
    const cw = (W - (i.image ? imgW + 10 : 0)) / items.length;
    items.forEach(([k, v], idx) => {
      doc.fillColor(MUTED).font("R").fontSize(6.8).text(k, left + 8 + idx * cw, y + 7, { characterSpacing: 0.5 });
      doc.fillColor(INK).font("B").fontSize(10).text(v, left + 8 + idx * cw, y + 18);
    });
    y += 46;
    const verify = [c.length, c.width, c.efficiency, c.lengthPerSet, c.totalLength, c.totalPieces].some((x) => x.requiresVerification && !x.manual);
    if (verify) {
      doc.fillColor("#b45309").font("R").fontSize(7.5).text("CAD: one or more values were flagged for manual verification (see Excel/Checks).", left, y - 2);
      y += 10;
    }
  }
  y = Math.max(y, 142 + (i.image ? 0 : 0));

  const ensure = (h: number) => {
    if (y + h > bottomLimit()) {
      doc.addPage();
      hdr();
      y = 30;
    }
  };

  if (i.doc.type === "CLIENT") pdfClient(doc, i.doc, calculateClientCost(i.doc), { left, W, ensure, getY: () => y, setY: (v) => (y = v) });
  else pdfActual(doc, i.doc, calculateActualCost(i.doc), { left, W, ensure, getY: () => y, setY: (v) => (y = v) });

  const cmp = comparisonFor(i);
  if (cmp) {
    ensure(40);
    y += 14;
    doc.fillColor(ACCENT).font("B").fontSize(10).text("ACTUAL VS CLIENT", left, y, { characterSpacing: 0.8 });
    y += 16;
    if (i.other?.paired) {
      doc.fillColor("#b45309").font("R").fontSize(8).text(`Manual pairing: ${i.other.label ?? "other costing"} — not the same style.`, left, y);
      y += 12;
    }
    const cols = [150, 70, 70, 70, 56, 82, 82, 82];
    const heads = ["", "ACTUAL / pc", "CLIENT / pc", "DIFFERENCE", "PREMIUM", "ACTUAL total", "CLIENT total", "DIFF total"];
    const scale = Math.min(1, W / cols.reduce((a, b) => a + b, 0));
    const cw = cols.map((c) => c * scale);
    const rowOf = (vals: string[], bold = false, fill?: string) => {
      ensure(16);
      if (fill) doc.rect(left, y - 2, W, 15).fill(fill);
      let x = left;
      vals.forEach((v, k) => {
        doc.fillColor(INK).font(bold ? "B" : "R").fontSize(8).text(v, x + 3, y + 1, { width: cw[k] - 6, align: k === 0 ? "left" : "right", lineBreak: false });
        x += cw[k];
      });
      y += 15;
    };
    rowOf(heads, true, "#f2f4f7");
    for (const r of cmp.rows) rowOf([r.group, money(r.actualPerPc), money(r.clientPerPc), money(r.differencePerPc), r.premiumPct === null ? "—" : r.premiumPct.toFixed(1) + "%", money(r.actualTotal), money(r.clientTotal), money(r.differenceTotal)]);
    const t = cmp.totals;
    rowOf(["TOTAL", money(t.actualPerPc), money(t.clientPerPc), money(t.differencePerPc), t.premiumPct === null ? "—" : t.premiumPct.toFixed(1) + "%", money(t.actualTotal), money(t.clientTotal), money(t.differenceTotal)], true, "#e8eef7");
    ensure(30);
    y += 6;
    doc.fillColor(MUTED).font("R").fontSize(7.5).text(`Actual PER PC PROFIT ${rupee(cmp.margin.actualPerPcProfit)} (profit ${cmp.margin.actualProfitPct === null ? "—" : cmp.margin.actualProfitPct.toFixed(2) + "%"})  ·  Client Overhead+Margin ${rupee(cmp.margin.clientOverheadMarginPerPc)} / pc  ·  FINAL PO incl. transport ${rupee(cmp.clientPriceChain.finalPoPriceInclTransport)}`, left, y, { width: W });
    y += 14;
  }

  // footer on every page
  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(p);
    doc.page.margins.bottom = 0; // footer sits inside the bottom margin; avoid pdfkit auto-adding pages
    doc.fillColor(MUTED).font("R").fontSize(7).text(`${COMPANY} · Cost Engine ${ENGINE_VERSION} · generated ${(i.at ?? new Date()).toISOString().slice(0, 16).replace("T", " ")} UTC by ${i.user}`, left, doc.page.height - 30, { width: W - 60, lineBreak: false });
    doc.text(`Page ${p + 1} / ${range.count}`, left + W - 60, doc.page.height - 30, { width: 60, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}

interface Ctx {
  left: number;
  W: number;
  ensure: (h: number) => void;
  getY: () => number;
  setY: (y: number) => void;
}

function pdfActual(doc: PDFKit.PDFDocument, d: ActualCosting, res: ActualResult, c: Ctx) {
  const cols = [c.W - 3 * 84, 84, 84, 84];
  const row = (vals: string[], o: { bold?: boolean; fill?: string; color?: string } = {}) => {
    c.ensure(15);
    const y = c.getY();
    if (o.fill) doc.rect(c.left, y - 2, c.W, 15).fill(o.fill);
    let x = c.left;
    vals.forEach((v, k) => {
      doc.fillColor(o.color ?? INK).font(o.bold ? "B" : "R").fontSize(8.5).text(v, x + 3, y + 1, { width: cols[k] - 6, align: k === 0 ? "left" : "right", lineBreak: false, ellipsis: true });
      x += cols[k];
    });
    c.setY(y + 15);
  };
  row(["PARTICULARS", "QTY", "RATE", "PURCHASE"], { bold: true, fill: "#f2f4f7" });
  row(["ORDER PCS", q4(d.actual.orderPcs.qty), money(d.actual.orderPcs.rate), money(res.orderSale)]);
  row(["DISPATCH PCS", q4(d.actual.dispatchPcs.qty), money(d.actual.dispatchPcs.rate), money(res.dispatchSale)]);
  row(["CONSUMPTION (m / pc)", q4(d.actual.consumption.value), "", ""]);
  const block = (title: string, key: string, total?: [string, number]) => {
    row([title, "", "", ""], { bold: true, fill: "#e8eef7" });
    for (const l of d.lines.filter((x) => x.sectionKey === key && !x.removed)) {
      if (l.calc === "ENTERED_AMOUNT") row([`   ${label(l)}`, "", "", money(l.amount)]);
      else row([`   ${label(l)}`, q4(l.quantity), q4(l.rate), money(res.lineTotals[l.id])]);
    }
    if (total) row([total[0], "", "", money(total[1])], { bold: true });
  };
  block("FABRIC ORDER", "FABRIC_ORDER", ["Total fabric cost", res.totalFabricCost]);
  block("CMT", "CMT", ["Total CMT", res.cmtTotal]);
  block("TRIMS", "TRIMS", ["Total trims cost", res.totalTrimsCost]);
  block("LD CHARGES", "LD_CHARGES");
  row(["TOTAL COST", "", "", rupee(res.totalCost)], { bold: true, fill: "#e8eef7" });
  row(["COST PER PC", "", "", rupee(res.costPerPc)], { bold: true });
  row(["PROFIT", "", "", rupee(res.profit)]);
  row(["PER PC PROFIT", "", `profit % ${res.profitPct === null ? "—" : res.profitPct.toFixed(2)}`, rupee(res.perPcProfit)]);
  block("REJECT", "REJECT");
  row(["TOTAL VALUE LOSS", "", "", rupee(res.totalValueLoss)], { bold: true });
  row(["% VALUE LOSS", "", "", res.valueLossPct === null ? "—" : res.valueLossPct.toFixed(2) + "%"]);
  if (d.actual.notes.length) {
    c.ensure(24);
    doc.fillColor(MUTED).font("R").fontSize(7.5).text(`Notes: ${d.actual.notes.join(" · ")}`, c.left, c.getY() + 4, { width: c.W });
    c.setY(c.getY() + 18);
  }
}

function pdfClient(doc: PDFKit.PDFDocument, d: ClientCosting, res: ClientResult, c: Ctx) {
  const fixed = [30, 74, 64, 40, 64, 62, 70]; // TYPE, QUANTITY, PRICE, GST, BASE, INPUT, WITH GST
  const first = c.W - fixed.reduce((a, b) => a + b, 0);
  const cols = [first, ...fixed];
  const row = (vals: string[], o: { bold?: boolean; fill?: string; size?: number } = {}) => {
    c.ensure(14);
    const y = c.getY();
    if (o.fill) doc.rect(c.left, y - 2, c.W, 14).fill(o.fill);
    let x = c.left;
    vals.forEach((v, k) => {
      doc.fillColor(INK).font(o.bold ? "B" : "R").fontSize(o.size ?? 8).text(v, x + 3, y + 1, { width: cols[k] - 6, align: k === 0 ? "left" : k === 1 ? "center" : "right", lineBreak: false, ellipsis: true });
      x += cols[k];
    });
    c.setY(y + 14);
  };
  const head = () => row(["COST ITEM", "TYPE", "QUANTITY", "PRICE w/o GST", "GST", "BASE TOTAL", "INPUT COST", "WITH GST"], { bold: true, fill: "#f2f4f7", size: 7 });
  head();
  const phaseOf = (k: string) => d.client.sections.find((s) => s.key === k)?.phase ?? "MAIN";
  const sections = [...d.client.sections];
  for (const l of d.lines) if (!sections.find((s) => s.key === l.sectionKey)) sections.push({ key: l.sectionKey, label: l.sectionLabel, phase: "MAIN" });
  const block = (s: (typeof sections)[number]) => {
    const ls = d.lines.filter((l) => l.sectionKey === s.key && !l.removed);
    const t = res.sections.find((x) => x.key === s.key);
    row([s.label.toUpperCase(), "", "", "", "", money(t?.total), money(t?.gst), money(t?.withGst)], { bold: true, fill: "#e8eef7" });
    for (const l of ls) {
      const lr = res.lineResults[l.id];
      const isPct = l.calc === "PERCENT_OF_SUBTOTAL";
      const emptyLine = (l.quantity ?? 0) === 0 && (l.rate ?? 0) === 0 && (l.amount ?? 0) === 0;
      if (emptyLine) continue; // unused template slots stay in the data, not on the printout
      row([`   ${label(l)}`, l.itemType ?? "", isPct ? "% of Total" : `${q4(l.quantity)} ${l.uom ?? ""}`.trim(), isPct ? `${q4((l.rate ?? 0) * 100)}%` : q4(l.rate), l.gstRate === null ? "" : `${q4(l.gstRate * 100)}%`, money(lr.base), money(lr.gst), money(lr.withGst)]);
    }
  };
  for (const s of sections.filter((x) => phaseOf(x.key) === "MAIN")) block(s);
  row(["TOTAL", "", "", "", "", money(res.total.base), "", money(res.total.withGst)], { bold: true, fill: "#f2f4f7" });
  for (const s of sections.filter((x) => phaseOf(x.key) === "POST_TOTAL")) block(s);
  row(["TOTAL COST", "", "", "", "", money(res.totalCost.base), money(res.totalCost.gst), money(res.totalCost.withGst)], { bold: true, fill: "#dfe8f5" });
  c.ensure(90);
  let y = c.getY() + 10;
  const kv = (k: string, v: string, bold = false) => {
    doc.fillColor(INK).font(bold ? "B" : "R").fontSize(bold ? 10 : 9).text(k, c.left + c.W - 330, y, { width: 220 });
    doc.text(v, c.left + c.W - 100, y, { width: 100, align: "right" });
    y += bold ? 16 : 13;
  };
  kv("FOB Price", rupee(res.fobPrice), true);
  kv(`FINANCE COST${d.client.finance.referenceRate !== null ? ` (label ${(d.client.finance.referenceRate * 100).toFixed(0)}%, applied ${(d.client.finance.rate * 100).toFixed(2)}%)` : ""}`, rupee(res.financeCost));
  kv("FINAL PO PRICE", rupee(res.finalPoPrice), true);
  kv("Transport", rupee(res.transport));
  kv("FINAL PO PRICE Incl Transport", rupee(res.finalPoPriceInclTransport), true);
  c.setY(y);
  void explainCosting;
  void cadEffective;
  void (null as unknown as CostLine);
}
