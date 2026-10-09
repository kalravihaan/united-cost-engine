import "./env";
import fs from "node:fs";
import path from "node:path";
import { rebuildTemplateFromReference } from "@/services/templateService";
import { seedDefaultRules } from "@/services/rulesService";
import { prisma } from "@/server/db";

/**
 * Initial configuration only: NO styles, costings, rates or customers are created.
 *  - editable costing/grouping rules
 *  - the default costing structure of each mode (all headers and rows), learnt from the reference workbooks in
 *    data/reference/. Re-run any time; use Masters → Costing Templates to edit the structure afterwards.
 *  - category tiers (Overhead + margin) and UOM list found in the client reference workbook
 */
async function main() {
  const dir = path.resolve("data/reference");
  const user = process.env.DEFAULT_USER || "Costing Desk";
  console.log("rules:", await seedDefaultRules());
  // one actual template, and one client template per customer layout (DEFAULT = the original GET layout)
  const jobs = [
    { type: "ACTUAL", file: "actual_costing.xlsx", format: null, extra: ["actual_costing_2.xlsx"] },
    { type: "CLIENT", file: "client_costing.xlsx", format: null, extra: [] },
    { type: "CLIENT", file: "client_costing_YOUSTA.xlsx", format: { key: "YOUSTA", label: "YOUSTA" }, extra: [] },
  ] as const;
  for (const { type, file, format, extra } of jobs) {
    const key = format?.key ?? "DEFAULT";
    const existing = await prisma.costTemplate.findUnique({ where: { costingType_formatKey: { costingType: type, formatKey: key } } });
    if (existing) {
      console.log(`${type} ${key} template already exists (v${existing.version}); left untouched`);
      continue;
    }
    const r = await rebuildTemplateFromReference(type, fs.readFileSync(path.join(dir, file)), file, user, format, extra.map((f) => ({ bytes: fs.readFileSync(path.join(dir, f)), fileName: f })));
    console.log(`${type} ${key} template: ${r.lines} rows in ${r.sections} headers`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
