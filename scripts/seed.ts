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
  for (const [type, file] of [["ACTUAL", "actual_costing.xlsx"], ["CLIENT", "client_costing.xlsx"]] as const) {
    const existing = await prisma.costTemplate.findUnique({ where: { costingType: type } });
    if (existing) {
      console.log(`${type} template already exists (v${existing.version}); left untouched`);
      continue;
    }
    const r = await rebuildTemplateFromReference(type, fs.readFileSync(path.join(dir, file)), file, user);
    console.log(`${type} template: ${r.lines} rows in ${r.sections} headers`);
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
