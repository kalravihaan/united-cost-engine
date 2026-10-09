import "./env";
import fs from "node:fs";
import path from "node:path";
import { rebuildTemplateFromReference } from "@/services/templateService";
import { prisma } from "@/server/db";

/**
 * npm run template -- actual file1.xlsx [file2.xlsx …]          (several workbooks are learnt together)
 * npm run template -- client file.xlsx [FORMAT_KEY ["Layout name"] [--also newer-sheet.xlsx …]]
 * Replaces the default structure of that mode; for client costing a FORMAT_KEY learns/replaces one customer layout.
 */
async function main() {
  const [kind, file, ...rest] = process.argv.slice(2);
  // actual: further workbooks follow; client: FORMAT_KEY ["Layout name"] [--also more.xlsx …]
  const alsoAt = rest.indexOf("--also");
  const own = alsoAt < 0 ? rest : rest.slice(0, alsoAt);
  const [key, label] = kind === "client" ? own : [];
  const files = kind === "actual" ? rest : alsoAt < 0 ? [] : rest.slice(alsoAt + 1);
  const extras = files.map((f) => ({ bytes: fs.readFileSync(f), fileName: path.basename(f) }));
  if (!["actual", "client"].includes(kind) || !file) {
    console.error('usage: npm run template -- actual <a.xlsx> [b.xlsx …]  |  client <reference.xlsx> [FORMAT_KEY ["Layout name"]]');
    process.exit(2);
  }
  const r = await rebuildTemplateFromReference(kind.toUpperCase() as "ACTUAL" | "CLIENT", fs.readFileSync(file), path.basename(file), process.env.DEFAULT_USER || "Costing Desk", key ? { key, label } : null, extras);
  console.log(`${kind} ${r.format} template v${r.version}: ${r.lines} rows in ${r.sections} headers`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
