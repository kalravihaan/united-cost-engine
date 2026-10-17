/**
 * Excel export check: are the exported workbooks' live formulas correct?
 *
 *   npx tsx scripts/verify-export-recalc.ts [work-dir]        (needs LibreOffice: `soffice` on PATH, or SOFFICE=/path/to/soffice)
 *
 * Exports Actual and Client costings built from the reference workbooks (three actual sheets, the GET client sheet and the
 * YOUSTA `2243` sheet with its MSME price), lets LibreOffice recalculate every export headlessly, and compares each formula
 * cell's value as written by the engine with the value LibreOffice computes. Exit code 1 on any difference or error cell.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ExcelJS from "exceljs";
import "./env";
import { parseActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { exportExcel } from "@/lib/export/documents";
import { DEFAULT_RULES } from "@/data/defaultRules";
import type { CostingDoc } from "@/types/costing";

const now = () => new Date("2026-01-01T00:00:00Z");
const dir = process.argv[2] ? path.resolve(process.argv[2]) : fs.mkdtempSync(path.join(os.tmpdir(), "uce-export-"));
fs.mkdirSync(dir, { recursive: true });
const soffice = process.env.SOFFICE ?? "soffice";

const val = (c: ExcelJS.Cell): unknown => {
  const v = c.value as unknown;
  if (v && typeof v === "object" && ("formula" in (v as object) || "sharedFormula" in (v as object))) return (v as { result?: unknown }).result;
  return v;
};

async function main() {
  const jobs: Array<{ name: string; doc: CostingDoc }> = [];
  const a2 = await parseActualWorkbook(fs.readFileSync("data/reference/actual_costing_2.xlsx"), "actual_costing_2.xlsx", now);
  const a1 = await parseActualWorkbook(fs.readFileSync("data/reference/actual_costing.xlsx"), "actual_costing.xlsx", now);
  for (const sheet of ["5008 - fuchsia", "6206", "4112"]) {
    const s = a2.sheets.find((x) => x.doc.source?.sheet === sheet);
    if (s) jobs.push({ name: `actual_${sheet.replace(/\W+/g, "_")}`, doc: s.doc });
  }
  jobs.push({ name: "actual_first_sheet", doc: a1.sheets[0].doc });
  const get = await parseClientWorkbook(fs.readFileSync("data/reference/client_costing.xlsx"), "client_costing.xlsx", now);
  jobs.push({ name: "client_get_5008", doc: get.sheets[0].doc });
  const you = await parseClientWorkbook(fs.readFileSync("data/reference/client_costing_YOUSTA_2243.xlsx"), "client_costing_YOUSTA_2243.xlsx", now);
  jobs.push({ name: "client_yousta_2243_msme", doc: you.sheets[0].doc });

  for (const j of jobs) fs.writeFileSync(path.join(dir, `${j.name}.xlsx`), await exportExcel({ doc: j.doc, style: { number: j.name }, user: "export-check", rules: DEFAULT_RULES, at: now() }));

  const out = path.join(dir, "recalculated");
  execFileSync(soffice, ["--headless", `-env:UserInstallation=file://${path.join(dir, "lo-profile")}`, "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", out, ...jobs.map((j) => path.join(dir, `${j.name}.xlsx`))], { stdio: "ignore" });

  let bad = 0;
  for (const j of jobs) {
    const mine = new ExcelJS.Workbook();
    const lo = new ExcelJS.Workbook();
    await mine.xlsx.readFile(path.join(dir, `${j.name}.xlsx`));
    await lo.xlsx.readFile(path.join(out, `${j.name}.xlsx`));
    let formulas = 0;
    let diffs = 0;
    let nonZero = 0; // formula cells whose value is a real number on at least one side (so the comparison is not vacuous)
    for (const ws of mine.worksheets) {
      const other = lo.getWorksheet(ws.name);
      ws.eachRow((row) =>
        row.eachCell((cell) => {
          const raw = cell.value as unknown;
          if (!(raw && typeof raw === "object" && "formula" in (raw as object))) return;
          formulas++;
          const a = val(cell);
          const b = other ? val(other.getCell(cell.address)) : undefined;
          const err = typeof b === "string" && b.startsWith("#");
          // exceljs omits `result` when a formula's value is exactly 0 / empty: treat a missing result as 0 against a number
          const na = a === undefined || a === null ? 0 : a;
          const nb = b === undefined || b === null ? 0 : b;
          if ((typeof na === "number" && na !== 0) || (typeof nb === "number" && nb !== 0)) nonZero++;
          const same = typeof na === "number" && typeof nb === "number" ? Math.abs(na - nb) <= 1e-6 * Math.max(1, Math.abs(nb)) : a === b;
          if (err || !same) {
            diffs++;
            if (diffs <= 5) console.log(`  DIFF ${ws.name}!${cell.address}  engine ${JSON.stringify(a)}  LibreOffice ${JSON.stringify(b)}`);
          }
        }),
      );
    }
    console.log(`${diffs ? "FAIL" : "ok  "}  ${j.name}: ${formulas} formulas (${nonZero} with a non-zero value), ${diffs} differences`);
    bad += diffs;
  }
  console.log(`\nfiles in ${dir}`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});
