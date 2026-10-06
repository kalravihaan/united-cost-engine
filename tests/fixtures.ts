import fs from "node:fs";
import path from "node:path";
import { parseActualWorkbook, type ParsedActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook, type ParsedClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { parseCadPdf } from "@/lib/cad/cadParser";
import { loadWorkbook } from "@/lib/parsers/workbook";

const root = path.resolve(__dirname, "..", "data", "reference");
export const sourcePath = (f: string) => (f.endsWith(".pdf") ? path.join(__dirname, "fixtures", f) : path.join(root, f));

let actual: Promise<ParsedActualWorkbook> | null = null;
let client: Promise<ParsedClientWorkbook> | null = null;

export const actualFixture = () => (actual ??= parseActualWorkbook(fs.readFileSync(sourcePath("actual_costing.xlsx")), "actual_costing.xlsx", () => new Date("2026-01-01T00:00:00Z")));
export const clientFixture = () => (client ??= parseClientWorkbook(fs.readFileSync(sourcePath("client_costing.xlsx")), "client_costing.xlsx", () => new Date("2026-01-01T00:00:00Z")));
export const cadFixture = () => parseCadPdf(fs.readFileSync(sourcePath("cad_72232.pdf")));
export const rawClientWorkbook = () => loadWorkbook(fs.readFileSync(sourcePath("client_costing.xlsx")));
export const rawActualWorkbook = () => loadWorkbook(fs.readFileSync(sourcePath("actual_costing.xlsx")));

export const close = (a: number | null, b: number | null, rel = 1e-9) => {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= Math.max(1e-9, rel * Math.max(Math.abs(a), Math.abs(b)));
};
