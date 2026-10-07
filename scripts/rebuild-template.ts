import "./env";
import fs from "node:fs";
import path from "node:path";
import { rebuildTemplateFromReference } from "@/services/templateService";
import { prisma } from "@/server/db";

/**
 * npm run template -- actual|client path/to/reference.xlsx [FORMAT_KEY ["Layout name"]]
 * Replaces the default structure of that mode; for client costing a FORMAT_KEY learns/replaces one customer layout.
 */
async function main() {
  const [kind, file, key, label] = process.argv.slice(2);
  if (!["actual", "client"].includes(kind) || !file) {
    console.error('usage: npm run template -- <actual|client> <reference.xlsx> [FORMAT_KEY ["Layout name"]]');
    process.exit(2);
  }
  const r = await rebuildTemplateFromReference(kind.toUpperCase() as "ACTUAL" | "CLIENT", fs.readFileSync(file), path.basename(file), process.env.DEFAULT_USER || "Costing Desk", key ? { key, label } : null);
  console.log(`${kind} ${r.format} template v${r.version}: ${r.lines} rows in ${r.sections} headers`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
