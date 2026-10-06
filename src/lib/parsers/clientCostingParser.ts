import type {
  ClientCosting,
  ClientSectionDef,
  CostLine,
  ImportIssue,
  LineCalc,
  SourceRef,
} from "@/types/costing";
import { collapse, slug, splitStyleTitle } from "@/lib/normalization/labels";
import {
  colIndex,
  colLetter,
  extractSheetImages,
  formulaRefs,
  loadWorkbook,
  normalizeLabel,
  num,
  readCell,
  text,
  type Sheet,
  type SheetImage,
} from "./workbook";

/**
 * Client-costing workbook parser.
 *
 * Columns are located by their header text (normalized), not by letter, so a
 * workbook with reordered/added columns still imports. Row meaning is derived
 * from structure: category rows before the "Total" marker are the MAIN phase,
 * rows between "Total" and "Total Cost" are POST_TOTAL, and the summary block
 * (FOB Price / FINANCE COST / FINAL PO PRICE / Transport …) is read by label.
 */

type ClientField =
  | "productId"
  | "designId"
  | "category"
  | "item"
  | "description"
  | "itemType"
  | "quantity"
  | "uom"
  | "hsCode"
  | "duty"
  | "rate"
  | "baseTotal"
  | "withGst"
  | "gst"
  | "inputCost"
  | "currency"
  | "fabricType"
  | "fabricFinish"
  | "construction"
  | "knitGauge"
  | "cuttableWidth"
  | "source"
  | "costingScenario"
  | "action";

/** header text (normalized) → field */
const HEADER_MAP: Array<[RegExp, ClientField]> = [
  [/^product id$/, "productId"],
  [/^design id$/, "designId"],
  [/^cost item category$/, "category"],
  [/^cost item$/, "item"],
  [/^description$/, "description"],
  [/^item type$/, "itemType"],
  [/^quantity$/, "quantity"],
  [/^quantity uom$/, "uom"],
  [/^hs code$/, "hsCode"],
  [/^duty ?%$/, "duty"],
  [/^price without gst$/, "rate"],
  [/^base total ?\(w\/o gst factor\)$/, "baseTotal"],
  [/^base total ?\(with gst\)$/, "withGst"],
  [/^gst$/, "gst"],
  [/^input cost/, "inputCost"],
  [/^currency$/, "currency"],
  [/^fabric type$/, "fabricType"],
  [/^fabric finish$/, "fabricFinish"],
  [/^fabric construction/, "construction"],
  [/^knit gauge$/, "knitGauge"],
  [/^cuttable width$/, "cuttableWidth"],
  [/^source$/, "source"],
  [/^costing scenario$/, "costingScenario"],
  [/^action$/, "action"],
];

export interface OverheadMarginTier {
  /** fraction, 0.08 */
  rate: number;
  category: string;
  /** value under the "Qty" header in the source table */
  qty: number | null;
  ref: SourceRef;
}

export interface ClientCachedTotals {
  total: number | null;
  totalCost: number | null;
  totalCostWithGst: number | null;
  totalGst: number | null;
  fobPrice: number | null;
  financeCost: number | null;
  finalPoPrice: number | null;
  transport: number | null;
  finalPoPriceInclTransport: number | null;
}

export interface ParsedClientSheet {
  doc: ClientCosting;
  cached: ClientCachedTotals;
  overheadTiers: OverheadMarginTier[];
  images: SheetImage[];
  /** columns found, field → letter (for the import report) */
  columns: Record<string, string>;
  /** UOM list the workbook offers in its Quantity UOM drop-down (data validation range), when present */
  uomOptions: string[];
}

export interface ParsedClientWorkbook {
  fileName: string;
  sheets: ParsedClientSheet[];
  issues: ImportIssue[];
}

function r(file: string, sheet: string, cell: string, column?: string): SourceRef {
  return { file, sheet, cell, column };
}

function detectHeader(ws: Sheet): { row: number; cols: Partial<Record<ClientField, number>>; labels: Partial<Record<ClientField, string>> } | null {
  const maxRow = Math.min(ws.rowCount, 10);
  for (let row = 1; row <= maxRow; row++) {
    const cols: Partial<Record<ClientField, number>> = {};
    const labels: Partial<Record<ClientField, string>> = {};
    const last = Math.max(ws.columnCount, 28);
    for (let c = 1; c <= last; c++) {
      const label = text(readCell(ws, row, c));
      if (!label) continue;
      const n = normalizeLabel(label);
      for (const [re, f] of HEADER_MAP) {
        if (re.test(n) && cols[f] === undefined) {
          cols[f] = c;
          labels[f] = label.trim();
          break;
        }
      }
    }
    if (cols.category && cols.item && cols.quantity && cols.rate) return { row, cols, labels };
  }
  return null;
}

/** Scan column of `labelCol` for summary labels and read the value from `valueCol`. */
function findSummary(
  ws: Sheet,
  scanCols: number[],
  valueCol: number,
  from: number,
): Record<string, { row: number; value: number | null; formula: string | null; label: string; address: string }> {
  const out: Record<string, { row: number; value: number | null; formula: string | null; label: string; address: string }> = {};
  const last = Math.max(ws.rowCount, 80);
  for (let row = from; row <= last; row++) {
    for (const sc of scanCols) {
      const label = collapse(text(readCell(ws, row, sc)));
      if (!label) continue;
      const n = normalizeLabel(label);
      let key: string | null = null;
      if (n === "fob price") key = "fob";
      else if (n.startsWith("finance cost")) key = "finance";
      else if (n === "final po price") key = "final";
      else if (n === "transport") key = "transport";
      else if (n.startsWith("final po price incl")) key = "finalIncl";
      if (!key) continue;
      const v = readCell(ws, row, valueCol);
      out[key] = { row, value: num(v), formula: v.formula, label, address: v.address };
    }
  }
  return out;
}

/** Values of the range used as list-validation source of the Quantity UOM column (e.g. $AB$3:$AB$5). */
function readUomOptions(ws: Sheet, uomCol: number | undefined): string[] {
  if (!uomCol) return [];
  const model = (ws as unknown as { dataValidations?: { model?: Record<string, { type?: string; formulae?: string[] }> } }).dataValidations?.model ?? {};
  for (const [addr, dv] of Object.entries(model)) {
    const m = addr.match(/^([A-Z]+)\d+/);
    if (!m || colIndex(m[1]) !== uomCol || dv.type !== "list") continue;
    const f = dv.formulae?.[0]?.match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/);
    if (!f) continue;
    const col = colIndex(f[1]);
    const out: string[] = [];
    for (let r = Number(f[2]); r <= Number(f[4]); r++) {
      const v = text(readCell(ws, r, col));
      if (v) out.push(v);
    }
    if (out.length) return out;
  }
  return [];
}

export function parseClientSheet(ws: Sheet, wb: import("exceljs").Workbook, fileName: string, importedAt: string): ParsedClientSheet {
  const sheet = ws.name;
  const issues: ImportIssue[] = [];
  const header = detectHeader(ws);
  if (!header) {
    throw new Error(`Sheet "${sheet}": client-costing header row (Cost Item category / Cost Item / Quantity / Price without GST) not found.`);
  }
  const { cols, row: headerRow, labels } = header;
  const colLetters: Record<string, string> = {};
  for (const [f, c] of Object.entries(cols)) colLetters[f] = colLetter(c as number);

  const get = (row: number, f: ClientField) => (cols[f] ? readCell(ws, row, cols[f]!) : null);
  const lastRow = Math.max(ws.rowCount, 80);

  // 1) structure markers in the Description column
  let totalRow: number | null = null;
  let totalCostRow: number | null = null;
  for (let row = headerRow + 1; row <= lastRow; row++) {
    const d = normalizeLabel(text(get(row, "description") ?? { value: null, formula: null, address: "" }));
    if (d === "total" && totalRow === null) totalRow = row;
    else if (d === "total cost" && totalCostRow === null) totalCostRow = row;
  }
  if (totalRow === null) issues.push({ level: "error", code: "TOTAL_ROW_MISSING", message: `${sheet}: no "Total" marker row found in the Description column.` });
  if (totalCostRow === null) issues.push({ level: "error", code: "TOTAL_COST_ROW_MISSING", message: `${sheet}: no "Total Cost" marker row found.` });

  // 2) lines
  const sections: ClientSectionDef[] = [];
  const lines: CostLine[] = [];
  const idCounts = new Map<string, number>();
  const baseColLetter = colLetters.baseTotal ?? "L";
  const endRow = (totalCostRow ?? lastRow + 1) - 1;
  let skippedBlank = 0;
  let firstDataRow: number | null = null;
  const headerNotes: string[] = [];

  for (let row = headerRow + 1; row <= endRow; row++) {
    if (row === totalRow) continue;
    const category = collapse(text(get(row, "category") ?? { value: null, formula: null, address: "" }));
    const productCell = get(row, "productId");
    const productText = productCell ? collapse(text(productCell)) : "";
    const phase: "MAIN" | "POST_TOTAL" = totalRow !== null && row > totalRow ? "POST_TOTAL" : "MAIN";

    if (!category) {
      // Memo text living in the Product ID column on rows without a category
      if (productText && firstDataRow !== null) headerNotes.push(productText);
      continue;
    }
    if (firstDataRow === null) firstDataRow = row;
    else if (productText) headerNotes.push(productText);

    const item = collapse(text(get(row, "item") ?? { value: null, formula: null, address: "" }));
    const description = collapse(text(get(row, "description") ?? { value: null, formula: null, address: "" }));
    const qty = get(row, "quantity");
    const rate = get(row, "rate");
    const gst = get(row, "gst");
    const q = qty ? num(qty) : null;
    const rt = rate ? num(rate) : null;
    const baseCell = get(row, "baseTotal");

    const nonZero = (q ?? 0) !== 0 || (rt ?? 0) !== 0;
    if (!item && !description && !nonZero) {
      skippedBlank++;
      // a header-only section row still defines the section order
      const key = slug(category);
      if (!sections.find((s) => s.key === key)) sections.push({ key, label: category, phase });
      continue;
    }

    const sectionKey = slug(category);
    if (!sections.find((s) => s.key === sectionKey)) sections.push({ key: sectionKey, label: category, phase });
    const base = slug(item || description || category) || `row${row}`;
    const k = `${sectionKey}:${base}`;
    const n = (idCounts.get(k) ?? 0) + 1;
    idCounts.set(k, n);
    const id = `${sectionKey}:${base}${n > 1 ? `_${n}` : ""}`;

    // Calculation kind: derived from the source formula for "Base Total (W/o GST Factor)"
    let calc: LineCalc = "QTY_X_RATE";
    let sourceFormula: string | undefined;
    if (baseCell?.formula) {
      sourceFormula = `=${baseCell.formula}`;
      const refs = formulaRefs(baseCell.formula);
      const totalRef = totalRow ? `${baseColLetter}${totalRow}` : null;
      if (totalRef && refs.includes(totalRef)) calc = "PERCENT_OF_SUBTOTAL";
    }

    const attributes: CostLine["attributes"] = {};
    const attrFields: ClientField[] = ["hsCode", "duty", "fabricType", "fabricFinish", "construction", "knitGauge", "cuttableWidth", "source", "costingScenario", "action"];
    for (const f of attrFields) {
      const c = get(row, f);
      if (!c) continue;
      const v = c.value;
      attributes[f] = v === null || v === undefined ? null : typeof v === "number" ? v : text(c);
    }
    const designCell = get(row, "designId");
    if (designCell && text(designCell)) attributes.designId = text(designCell);
    // Source files keep a per-row helper value in a column with no header (AB in the supplied file): do not guess its meaning.
    const refCommon = (c: { address: string } | null, col?: string): SourceRef => r(fileName, sheet, c?.address ?? `${row}`, col);

    const line: CostLine = {
      id,
      sectionKey,
      sectionLabel: category,
      item,
      description,
      itemType: (() => {
        const c = get(row, "itemType");
        const t = c ? text(c) : "";
        return t || null;
      })(),
      quantity: q,
      uom: (() => {
        const c = get(row, "uom");
        const t = c ? text(c) : "";
        return t || null;
      })(),
      rate: rt,
      gstRate: gst ? num(gst) : null,
      currency: (() => {
        const c = get(row, "currency");
        return (c ? text(c) : "") || "INR";
      })(),
      calc,
      attributes,
      prov: {},
      sourceFormula,
      sourceRef: { file: fileName, sheet, cell: `${colLetters.item ?? "D"}${row}`, note: `row ${row}` },
    };
    if (q !== null && qty) line.prov.quantity = { origin: "IMPORT", ref: refCommon(qty, labels.quantity) };
    if (rt !== null && rate) line.prov.rate = { origin: "IMPORT", ref: refCommon(rate, labels.rate) };
    if (line.gstRate !== null && gst) line.prov.gstRate = { origin: "IMPORT", ref: refCommon(gst, labels.gst) };
    if (line.uom) line.prov.uom = { origin: "IMPORT", ref: refCommon(get(row, "uom"), labels.uom) };
    lines.push(line);
  }

  // 3) summary block
  const scanCols = [colIndex(colLetters.hsCode ?? "I"), colIndex(colLetters.description ?? "E")];
  const valueCol = cols.baseTotal ?? colIndex("L");
  const sum = findSummary(ws, [...new Set(scanCols)], valueCol, (totalCostRow ?? headerRow) + 1);

  let financeRate = 0;
  let financeRef: number | null = null;
  if (sum.finance) {
    const m = sum.finance.label.match(/(\d+(?:\.\d+)?)\s*%/);
    financeRef = m ? Number(m[1]) / 100 : null;
    const f = sum.finance.formula;
    const fm = f?.match(/\*\s*(\d+(?:\.\d+)?)\s*$/) ?? f?.match(/^\s*(\d+(?:\.\d+)?)\s*\*/);
    if (fm) financeRate = Number(fm[1]);
    else if (f) issues.push({ level: "warning", code: "FINANCE_FORMULA", message: `${sheet}: finance-cost formula =${f} not recognised; rate set to 0 – verify.`, ref: r(fileName, sheet, sum.finance.address) });
    if (financeRef !== null && financeRate !== financeRef) {
      issues.push({
        level: "warning",
        code: "FINANCE_RATE_AMBIGUOUS",
        message: `${sheet}: label says "${sum.finance.label}" but the source formula (=${f}) applies a factor of ${financeRate}. The formula factor is kept as the input; the labelled rate is a reference only.`,
        ref: r(fileName, sheet, sum.finance.address),
      });
    }
  } else {
    issues.push({ level: "warning", code: "FINANCE_MISSING", message: `${sheet}: FINANCE COST row not found.` });
  }
  if (!sum.transport) issues.push({ level: "warning", code: "TRANSPORT_MISSING", message: `${sheet}: Transport row not found.` });

  // 4) overhead + margin table
  const overheadTiers: OverheadMarginTier[] = [];
  for (let row = (totalCostRow ?? headerRow) + 1; row <= lastRow; row++) {
    const a = collapse(text(readCell(ws, row, 1)));
    const aNorm = normalizeLabel(a);
    if (aNorm.replace(/\s/g, "").startsWith("overhead+margin")) {
      for (let rr = row; rr <= lastRow; rr++) {
        const rate = num(readCell(ws, rr, 2));
        const cat = collapse(text(readCell(ws, rr, 3)));
        if (rate === null || !cat) break;
        overheadTiers.push({ rate, category: cat, qty: num(readCell(ws, rr, 4)), ref: r(fileName, sheet, `B${rr}`, "Overhead + margin") });
      }
      break;
    }
  }

  // 5) identity
  const productId = (() => {
    if (firstDataRow === null || !cols.productId) return "";
    return collapse(text(readCell(ws, firstDataRow, cols.productId)));
  })();
  const t = splitStyleTitle(productId);
  const number = productId.toUpperCase().includes(sheet.trim().toUpperCase()) ? sheet.trim() : t.head || sheet.trim();
  const designId = (() => {
    if (firstDataRow === null || !cols.designId) return undefined;
    const v = text(readCell(ws, firstDataRow, cols.designId));
    return v || undefined;
  })();
  if (!productId) issues.push({ level: "warning", code: "PRODUCT_ID_MISSING", message: `${sheet}: Product ID not found; style number taken from the worksheet name.` });
  if (!designId) issues.push({ level: "info", code: "DESIGN_ID_BLANK", message: `${sheet}: Design ID is blank in the source.` });

  const doc: ClientCosting = {
    schemaVersion: 1,
    type: "CLIENT",
    style: { number, label: productId || sheet, color: t.color || undefined, productId: productId || undefined, designId },
    currency: lines[0]?.currency ?? "INR",
    lines,
    issues,
    source: { file: fileName, sheet, importedAt },
    client: {
      headerNotes,
      category: null,
      sections,
      finance: {
        rate: financeRate,
        referenceRate: financeRef,
        prov: sum.finance ? { origin: "IMPORT", ref: r(fileName, sheet, sum.finance.address, sum.finance.label) } : undefined,
        note: sum.finance?.formula ? `Source formula: =${sum.finance.formula}` : undefined,
      },
      transport: {
        amount: sum.transport?.value ?? 0,
        prov: sum.transport ? { origin: "IMPORT", ref: r(fileName, sheet, sum.transport.address, "Transport") } : undefined,
      },
    },
  };

  const cv = (rowN: number | null, col: number | undefined) => (rowN && col ? num(readCell(ws, rowN, col)) : null);
  const cached: ClientCachedTotals = {
    total: cv(totalRow, cols.baseTotal),
    totalCost: cv(totalCostRow, cols.baseTotal),
    totalCostWithGst: cv(totalCostRow, cols.withGst),
    totalGst: cv(totalCostRow, cols.inputCost),
    fobPrice: sum.fob?.value ?? null,
    financeCost: sum.finance?.value ?? null,
    finalPoPrice: sum.final?.value ?? null,
    transport: sum.transport?.value ?? null,
    finalPoPriceInclTransport: sum.finalIncl?.value ?? null,
  };
  if (skippedBlank > 0) issues.push({ level: "info", code: "BLANK_SLOTS", message: `${sheet}: ${skippedBlank} empty template rows (no item, description or value) were not turned into cost lines.` });

  return { doc, cached, overheadTiers, images: extractSheetImages(wb, ws), columns: colLetters, uomOptions: readUomOptions(ws, cols.uom) };
}

export async function parseClientWorkbook(
  input: Buffer | ArrayBuffer | Uint8Array,
  fileName: string,
  now: () => Date = () => new Date(),
): Promise<ParsedClientWorkbook> {
  const wb = await loadWorkbook(input);
  const importedAt = now().toISOString();
  const sheets: ParsedClientSheet[] = [];
  const issues: ImportIssue[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state !== "visible") continue;
    try {
      const p = parseClientSheet(ws, wb, fileName, importedAt);
      issues.push(...p.doc.issues.filter((i) => i.level !== "info"));
      sheets.push(p);
    } catch (e) {
      issues.push({ level: "error", code: "SHEET_UNPARSED", message: (e as Error).message, ref: { file: fileName, sheet: ws.name } });
    }
  }
  return { fileName, sheets, issues };
}
