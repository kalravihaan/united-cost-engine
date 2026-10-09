import type ExcelJS from "exceljs";
import type {
  ActualCosting,
  CostLine,
  ImportIssue,
  SourceRef,
} from "@/types/costing";
import { collapse, slug, splitStyleTitle } from "@/lib/normalization/labels";
import {
  colLetter,
  formulaRefs,
  loadWorkbook,
  normalizeLabel,
  num,
  readCell,
  text,
  type RawCell,
  type Sheet,
} from "./workbook";

/**
 * Actual-costing workbook parser.
 *
 * The source is one worksheet per style with a fixed row template whose labels
 * vary. Instead of hard-coding row numbers we locate the anchor labels in
 * column A ("FABRIC ORDER", "Total fabric cost", "TRIMS", …) so inserted /
 * removed rows are tolerated. Nothing is copied into code: every value comes
 * from the workbook.
 */

export const ACTUAL_SECTIONS = {
  FABRIC_ORDER: "FABRIC ORDER",
  CMT: "CMT",
  TRIMS: "TRIMS",
  LD_CHARGES: "LD CHARGES",
  REJECT: "REJECT",
} as const;

/** Values the workbook itself calculated (Excel cached results) – used for verification only. */
export interface ActualCachedTotals {
  orderSale: number | null;
  dispatchSale: number | null;
  totalFabricCost: number | null;
  totalTrimsCost: number | null;
  totalCost: number | null;
  costPerPc: number | null;
  profit: number | null;
  perPcProfit: number | null;
  profitPct: number | null;
  totalValueLoss: number | null;
  valueLossPct: number | null;
}

export interface ParsedActualSheet {
  doc: ActualCosting;
  cached: ActualCachedTotals;
}

export interface ParsedActualWorkbook {
  fileName: string;
  sheets: ParsedActualSheet[];
  issues: ImportIssue[];
}

interface Anchors {
  header: number;
  orderPcs?: number;
  dispatchPcs?: number;
  fabricOrder?: number;
  consumption?: number;
  totalFabric?: number;
  trims?: number;
  totalTrims?: number;
  ld?: number;
  totalCost?: number;
  costPerPc?: number;
  profit?: number;
  perPcProfit?: number;
  reject?: number;
  totalLoss?: number;
  pctLoss?: number;
}

function findAnchors(ws: Sheet): Anchors {
  const a: Anchors = { header: 1 };
  const last = Math.max(ws.rowCount, ws.actualRowCount, 60);
  for (let r = 1; r <= last; r++) {
    const label = normalizeLabel(text(readCell(ws, r, 1)));
    if (!label) continue;
    if (label === "order pcs") a.orderPcs ??= r;
    else if (label === "dispatch pcs") a.dispatchPcs ??= r;
    else if (label === "fabric order") a.fabricOrder ??= r;
    else if (label === "consupmtion" || label === "consumption") a.consumption ??= r;
    else if (label === "total fabric cost") a.totalFabric ??= r;
    else if (label === "trims") a.trims ??= r;
    else if (label === "total trims cost") a.totalTrims ??= r;
    else if (label === "ld charges") a.ld ??= r;
    else if (label === "total cost") a.totalCost ??= r;
    else if (label === "cost per pc") a.costPerPc ??= r;
    else if (label === "profit") a.profit ??= r;
    else if (label === "per pc profit") a.perPcProfit ??= r;
    else if (label === "reject") a.reject ??= r;
    else if (label === "total value loss") a.totalLoss ??= r;
    else if (label === "% value loss") a.pctLoss ??= r;
  }
  return a;
}

function ref(file: string, sheet: string, cell: string, column?: string): SourceRef {
  return { file, sheet, cell, column };
}

/** Does the row's total formula in column E multiply exactly this row's B and C? */
function isOwnRowQtyRate(formula: string | null, row: number): boolean {
  if (!formula) return true; // no formula = nothing to compare
  const refs = formulaRefs(formula).sort();
  return refs.length === 2 && refs[0] === `B${row}` && refs[1] === `C${row}`;
}

function lineFromRow(
  ws: Sheet,
  r: number,
  sectionKey: string,
  sectionLabel: string,
  file: string,
  issues: ImportIssue[],
  idCounts: Map<string, number>,
): CostLine | null {
  const a = readCell(ws, r, 1);
  const b = readCell(ws, r, 2);
  const c = readCell(ws, r, 3);
  const e = readCell(ws, r, 5);
  const item = collapse(text(a));
  const q = num(b);
  let rt = num(c);
  // Some sheets keep the rate of a row in column D and multiply B×D in column E (e.g. value-loss rows of the 5008 sheets)
  const d = readCell(ws, r, 4);
  let rateCell = c;
  let rateCol = "RATE";
  const eRefs = e.formula ? formulaRefs(e.formula).sort() : [];
  if (rt === null && num(d) !== null && eRefs.length === 2 && eRefs[0] === `B${r}` && eRefs[1] === `D${r}`) {
    rt = num(d);
    rateCell = d;
    rateCol = "RATE (column D)";
    issues.push({ level: "info", code: "RATE_IN_COLUMN_D", message: `${ws.name}!D${r} "${item || "(blank)"}": the rate is typed in column D (E = B×D); read as the rate.`, ref: ref(file, ws.name, d.address, "D") });
  }
  // typed text where a number belongs ("??"): Excel shows #VALUE!, the engine treats it as blank and says so
  for (const [cell, label] of [[b, "QTY"], [c, "RATE"]] as const) {
    const t = text(cell).trim();
    if (t && num(cell) === null && !cell.formula)
      issues.push({ level: "warning", code: "NON_NUMERIC_INPUT", message: `${ws.name}!${cell.address} "${item || "(blank)"}": ${label} is text ("${t}"), not a number; treated as blank – enter the figure.`, ref: ref(file, ws.name, cell.address, label) });
  }
  // Source slots with neither a label nor any number are not cost items.
  if (!item && q === null && rt === null) return null;
  const sheet = ws.name;
  const base = slug(item) || `row${r}`;
  const n = (idCounts.get(`${sectionKey}:${base}`) ?? 0) + 1;
  idCounts.set(`${sectionKey}:${base}`, n);
  const id = `${sectionKey}:${base}${n > 1 ? `_${n}` : ""}`;
  const line: CostLine = {
    id,
    sectionKey,
    sectionLabel,
    item,
    description: "",
    itemType: null,
    quantity: q,
    uom: null,
    rate: rt,
    gstRate: null,
    currency: "INR",
    calc: "QTY_X_RATE",
    attributes: {},
    prov: {},
    sourceRef: { file, sheet, cell: `A${r}`, note: `row ${r}` },
  };
  // a number typed as a sum in the sheet (=4065+1617) is kept as its value; the typed expression is kept in the source note
  const typed = (cell: { formula: string | null }) => (cell.formula ? { note: `typed as =${cell.formula}` } : {});
  if (q !== null) line.prov.quantity = { origin: "IMPORT", ref: { ...ref(file, sheet, b.address, "QTY"), ...typed(b) } };
  if (rt !== null) line.prov.rate = { origin: "IMPORT", ref: { ...ref(file, sheet, rateCell.address, rateCol), ...typed(rateCell) } };
  if (e.formula) line.sourceFormula = `=${e.formula}`;

  if (e.formula && !isOwnRowQtyRate(e.formula, r)) {
    issues.push({
      level: "info",
      code: "FORMULA_ANOMALY",
      message: `${sheet}!E${r} "${item || "(blank)"}" uses =${e.formula} instead of the own-row QTY×RATE; engine uses ${`B${r}`}×${`C${r}`}.`,
      ref: ref(file, sheet, e.address, "PURCHASE"),
    });
  }
  return line;
}

export function parseActualSheet(ws: Sheet, fileName: string, importedAt: string): ParsedActualSheet {
  const sheet = ws.name;
  const issues: ImportIssue[] = [];
  const a = findAnchors(ws);
  const required: Array<keyof Anchors> = ["orderPcs", "dispatchPcs", "fabricOrder", "totalFabric", "trims", "totalTrims", "totalCost"];
  for (const k of required) {
    if (!a[k]) issues.push({ level: "error", code: "ANCHOR_MISSING", message: `${sheet}: anchor row "${k}" not found – sheet structure differs from the actual-costing template.`, ref: { file: fileName, sheet } });
  }

  const title = text(readCell(ws, 1, 1));
  const t = splitStyleTitle(title);
  const number = sheet.trim();
  if (t.head && t.head.toUpperCase().replace(/^#/, "") !== number.toUpperCase()) {
    issues.push({
      level: "warning",
      code: "TITLE_MISMATCH",
      message: `Worksheet "${sheet}" has title "${title}" in A1 (style ${t.head}). Style number taken from the worksheet name; verify.`,
      ref: ref(fileName, sheet, "A1"),
    });
  }

  const lines: CostLine[] = [];
  const idCounts = new Map<string, number>();

  const collect = (from: number, to: number, key: string, label: string) => {
    for (let r = from; r < to; r++) {
      const l = lineFromRow(ws, r, key, label, fileName, issues, idCounts);
      if (l) lines.push(l);
    }
  };

  if (a.fabricOrder && a.totalFabric) {
    const start = (a.consumption ?? a.fabricOrder) + 1;
    collect(start, a.totalFabric, "FABRIC_ORDER", ACTUAL_SECTIONS.FABRIC_ORDER);
  }
  // CMT rows sit between "Total fabric cost" and the "TRIMS" header
  if (a.totalFabric && a.trims) {
    for (let r = a.totalFabric + 1; r < a.trims; r++) {
      const label = normalizeLabel(text(readCell(ws, r, 1)));
      if (label.startsWith("cmt") || (label === "" && num(readCell(ws, r, 2)) !== null)) {
        const l = lineFromRow(ws, r, "CMT", ACTUAL_SECTIONS.CMT, fileName, issues, idCounts);
        if (l) lines.push(l);
      }
    }
  }
  if (a.trims && a.totalTrims) collect(a.trims + 1, a.totalTrims, "TRIMS", ACTUAL_SECTIONS.TRIMS);

  // LD CHARGES: single entered amount in the PURCHASE column
  if (a.ld) {
    const e = readCell(ws, a.ld, 5);
    const amount = num(e);
    lines.push({
      id: "LD_CHARGES:ld_charges",
      sectionKey: "LD_CHARGES",
      sectionLabel: ACTUAL_SECTIONS.LD_CHARGES,
      item: collapse(text(readCell(ws, a.ld, 1))),
      description: "",
      itemType: null,
      quantity: null,
      uom: null,
      rate: null,
      gstRate: null,
      currency: "INR",
      calc: "ENTERED_AMOUNT",
      amount,
      attributes: {},
      prov: amount !== null ? { amount: { origin: "IMPORT", ref: ref(fileName, sheet, e.address, "PURCHASE") } } : {},
      sourceRef: { file: fileName, sheet, cell: `E${a.ld}`, note: `row ${a.ld}` },
    });
  }

  // REJECT block
  if (a.reject && a.totalLoss) {
    collect(a.reject + 1, a.totalLoss, "REJECT", ACTUAL_SECTIONS.REJECT);
  }

  const cmtCount = lines.filter((l) => l.sectionKey === "CMT").length;
  if (cmtCount === 0) issues.push({ level: "warning", code: "NO_CMT", message: `${sheet}: no CMT line found.`, ref: { file: fileName, sheet } });

  // header values
  const orderRow = a.orderPcs ?? 2;
  const dispRow = a.dispatchPcs ?? 3;
  const consumptionCell = a.consumption ? readCell(ws, a.consumption, 2) : null;
  const notes: string[] = [];
  for (let r = 1; r <= 12; r++) {
    for (let c = 7; c <= 12; c++) {
      const v = text(readCell(ws, r, c));
      if (v) notes.push(v);
    }
  }

  const d41 = a.perPcProfit ? readCell(ws, a.perPcProfit, 4) : null;
  const profitPctAddsValueLossPct = !!d41?.formula && formulaRefs(d41.formula).some((x) => x.startsWith("D") && Number(x.slice(1)) === (a.pctLoss ?? 50));
  if (profitPctAddsValueLossPct) {
    issues.push({
      level: "warning",
      code: "FORMULA_VARIANT",
      message: `${sheet}!D${a.perPcProfit}: profit % formula is =${d41!.formula} (adds % value loss), unlike the other sheets. Reproduced as a per-sheet variant.`,
      ref: ref(fileName, sheet, d41!.address, "profit %"),
    });
  }

  const dedCell = readCell(ws, 4, 4);
  const deduction = num(dedCell) ?? 0;

  const pcs = (row: number) => ({ qty: num(readCell(ws, row, 2)), rate: num(readCell(ws, row, 3)) });
  const doc: ActualCosting = {
    schemaVersion: 1,
    type: "ACTUAL",
    style: {
      number,
      label: collapse(title) || number,
      color: t.color || undefined,
    },
    currency: "INR",
    lines,
    issues,
    source: { file: fileName, sheet, importedAt },
    actual: {
      orderPcs: pcs(orderRow),
      dispatchPcs: pcs(dispRow),
      consumption: {
        value: consumptionCell ? num(consumptionCell) : null,
        formula: consumptionCell?.formula ? `=${consumptionCell.formula}` : undefined,
        prov: consumptionCell && num(consumptionCell) !== null ? { origin: "IMPORT", ref: ref(fileName, sheet, consumptionCell.address, "CONSUPMTION") } : undefined,
      },
      deduction,
      profitPctAddsValueLossPct,
      notes,
    },
  };

  const v = (row: number | undefined, col: number) => (row ? num(readCell(ws, row, col)) : null);
  const cached: ActualCachedTotals = {
    orderSale: v(orderRow, 4),
    dispatchSale: v(dispRow, 4),
    totalFabricCost: v(a.totalFabric, 5),
    totalTrimsCost: v(a.totalTrims, 5),
    totalCost: v(a.totalCost, 5),
    costPerPc: v(a.costPerPc, 5),
    profit: v(a.profit, 5),
    perPcProfit: v(a.perPcProfit, 5),
    profitPct: v(a.perPcProfit, 4),
    totalValueLoss: v(a.totalLoss, 5),
    valueLossPct: v(a.pctLoss, 4),
  };

  return { doc, cached };
}

export async function parseActualWorkbook(
  input: Buffer | ArrayBuffer | Uint8Array,
  fileName: string,
  now: () => Date = () => new Date(),
): Promise<ParsedActualWorkbook> {
  const wb: ExcelJS.Workbook = await loadWorkbook(input);
  const importedAt = now().toISOString();
  const sheets: ParsedActualSheet[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, string>();
  for (const ws of wb.worksheets) {
    if (ws.state !== "visible") {
      issues.push({ level: "info", code: "SHEET_HIDDEN", message: `Hidden sheet "${ws.name}" skipped.`, ref: { file: fileName, sheet: ws.name } });
      continue;
    }
    const parsed = parseActualSheet(ws, fileName, importedAt);
    const key = parsed.doc.style.number.toUpperCase();
    if (seen.has(key)) {
      issues.push({ level: "error", code: "DUPLICATE_STYLE", message: `Style ${parsed.doc.style.number} appears in sheets "${seen.get(key)}" and "${ws.name}".` });
    }
    seen.set(key, ws.name);
    issues.push(...parsed.doc.issues.filter((i) => i.level !== "info"));
    sheets.push(parsed);
  }
  return { fileName, sheets, issues };
}

export { colLetter };
export type { RawCell };
