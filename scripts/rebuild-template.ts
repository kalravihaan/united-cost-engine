import "./env";
import fs from "node:fs";
import path from "node:path";
import { rebuildTemplateFromReference } from "@/services/templateService";
import { prisma } from "@/server/db";

/** npm run template -- actual|client path/to/reference.xlsx   (replaces the default structure of that mode) */
async function main() {
  const [kind, file] = process.argv.slice(2);
  if (!["actual", "client"].includes(kind) || !file) {
    console.error("usage: npm run template -- <actual|client> <reference.xlsx>");
    process.exit(2);
  }
  const r = await rebuildTemplateFromReference(kind.toUpperCase() as "ACTUAL" | "CLIENT", fs.readFileSync(file), path.basename(file), process.env.DEFAULT_USER || "Costing Desk");
  console.log(`${kind} template v${r.version}: ${r.lines} rows in ${r.sections} headers`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
