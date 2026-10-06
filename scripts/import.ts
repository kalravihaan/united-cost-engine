import "./env";
import fs from "node:fs";
import path from "node:path";
import { importActualWorkbook, importClientWorkbook, type ImportReport } from "@/services/importService";
import { prisma } from "@/server/db";

/**
 * Import costing workbooks.
 *   npm run import -- actual path/to/actual_costing.xlsx
 *   npm run import -- client path/to/client_costing.xlsx
 * Re-importing an unchanged workbook creates nothing; a changed sheet becomes a new version.
 */
async function main() {
  const [kind, file] = process.argv.slice(2);
  if (!["actual", "client"].includes(kind) || !file) {
    console.error("usage: npm run import -- <actual|client> <file.xlsx>");
    process.exit(2);
  }
  const bytes = fs.readFileSync(file);
  const user = process.env.DEFAULT_USER || "Costing Desk";
  const report: ImportReport = kind === "actual" ? await importActualWorkbook(bytes, path.basename(file), user) : await importClientWorkbook(bytes, path.basename(file), user);
  console.log(`${report.fileName}: ${report.sheets} sheet(s), ${report.created} new version(s), ${report.skipped} unchanged, ${report.stylesCreated} style(s) created`);
  for (const i of report.issues.filter((x) => x.level !== "info")) console.log(`  [${i.level}] ${i.code}: ${i.message}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
