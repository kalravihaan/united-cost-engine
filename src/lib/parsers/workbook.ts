import ExcelJS from "exceljs";

/**
 * Thin, typed wrapper over exceljs. All spreadsheet-library specifics stay in
 * this file so the costing parsers only deal with plain values + formula text.
 */

export interface RawCell {
  /** Cached/typed value (formula results resolved). null when blank. */
  value: string | number | boolean | Date | null;
  /** Formula text WITHOUT the leading "=", when the cell holds a formula */
  formula: string | null;
  address: string;
}

export type Sheet = ExcelJS.Worksheet;

export async function loadWorkbook(input: Buffer | ArrayBuffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const buf = input instanceof ArrayBuffer ? Buffer.from(input) : Buffer.from(input as Uint8Array);
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  return wb;
}

function unwrap(v: ExcelJS.CellValue): { value: RawCell["value"]; formula: string | null } {
  if (v === null || v === undefined) return { value: null, formula: null };
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) {
      const f = (o.formula as string | undefined) ?? (o.sharedFormula as string | undefined) ?? null;
      const r = o.result as unknown;
      let value: RawCell["value"] = null;
      if (typeof r === "number" || typeof r === "string" || typeof r === "boolean") value = r;
      else if (r instanceof Date) value = r;
      else if (r && typeof r === "object" && "error" in (r as object)) value = String((r as { error: string }).error);
      return { value, formula: f };
    }
    if ("richText" in o) {
      const text = (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
      return { value: text, formula: null };
    }
    if ("text" in o) return { value: String(o.text), formula: null }; // hyperlink
    if ("error" in o) return { value: String(o.error), formula: null };
  }
  if (typeof v === "string") return { value: v, formula: null };
  if (typeof v === "number" || typeof v === "boolean") return { value: v, formula: null };
  if (v instanceof Date) return { value: v, formula: null };
  return { value: String(v), formula: null };
}

export function readCell(ws: Sheet, row: number, col: number): RawCell {
  const cell = ws.getCell(row, col);
  const u = unwrap(cell.value);
  // exceljs' `cell.value` getter drops a formula result of 0; the model keeps it.
  if (u.formula !== null && u.value === null) {
    const r = (cell as unknown as { model?: { result?: unknown } }).model?.result;
    if (typeof r === "number" || typeof r === "string" || typeof r === "boolean") return { value: r, formula: u.formula, address: cell.address };
  }
  return { value: u.value, formula: u.formula, address: cell.address };
}

export function colLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function text(c: RawCell): string {
  if (c.value === null || c.value === undefined) return "";
  if (c.value instanceof Date) return c.value.toISOString();
  return String(c.value).trim();
}

export function num(c: RawCell): number | null {
  if (typeof c.value === "number" && Number.isFinite(c.value)) return c.value;
  return null;
}

/** Extract cell references (A1 style, optional $) from a formula string. */
export function formulaRefs(formula: string | null): string[] {
  if (!formula) return [];
  const out: string[] = [];
  const re = /\$?([A-Z]{1,3})\$?(\d+)(?![\d(])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula))) out.push(`${m[1]}${m[2]}`);
  return out;
}

export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ \s]+/g, " ")
    .trim();
}

export interface SheetImage {
  buffer: Buffer;
  extension: string;
  /** zero-based top-left anchor */
  anchor: { col: number; row: number } | null;
}

export function extractSheetImages(wb: ExcelJS.Workbook, ws: Sheet): SheetImage[] {
  const out: SheetImage[] = [];
  for (const img of ws.getImages()) {
    const media = (wb.model as unknown as { media?: Array<{ type: string; buffer: Buffer; extension: string }> }).media;
    const m = media?.[Number(img.imageId)];
    if (!m || !m.buffer) continue;
    const range = img.range as unknown as { tl?: { nativeCol?: number; nativeRow?: number; col?: number; row?: number } };
    out.push({
      buffer: Buffer.from(m.buffer),
      extension: m.extension || "png",
      anchor: range?.tl
        ? { col: range.tl.nativeCol ?? Math.floor(range.tl.col ?? 0), row: range.tl.nativeRow ?? Math.floor(range.tl.row ?? 0) }
        : null,
    });
  }
  return out;
}
