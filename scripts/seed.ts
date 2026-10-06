import "./env";
import fs from "node:fs";
import path from "node:path";
import { importActualWorkbook, importClientWorkbook } from "@/services/importService";
import { seedDefaultRules } from "@/services/rulesService";
import { uploadCad } from "@/services/cadService";
import { prisma } from "@/server/db";
import { styleRepository } from "@/server/repositories/styles";

/**
 * Initial dataset = the three supplied source files (data/sources). Nothing is typed in here:
 *  - costing rules (editable defaults)
 *  - actual_costing.xlsx  → 28 styles + Actual costings (v1)
 *  - client_costing.xlsx  → style 5008 + Client costing (v1) + style image + category tiers + UOMs
 *  - cad_72232.pdf        → style 72232 (read from the CAD itself) + extracted CAD data
 * No customers / brands are created: the source files carry no such information.
 */
async function main() {
  const dir = path.resolve("data/sources");
  const user = process.env.DEFAULT_USER || "Costing Desk";
  console.log("rules:", await seedDefaultRules());
  const a = await importActualWorkbook(fs.readFileSync(path.join(dir, "actual_costing.xlsx")), "actual_costing.xlsx", user);
  console.log(`actual: ${a.created} created, ${a.skipped} unchanged, ${a.stylesCreated} styles`);
  const c = await importClientWorkbook(fs.readFileSync(path.join(dir, "client_costing.xlsx")), "client_costing.xlsx", user);
  console.log(`client: ${c.created} created, ${c.skipped} unchanged, ${c.stylesCreated} styles`);

  const cadFile = path.join(dir, "cad_72232.pdf");
  if (fs.existsSync(cadFile)) {
    const bytes = fs.readFileSync(cadFile);
    const { parseCadPdf } = await import("@/lib/cad/cadParser");
    const cad = await parseCadPdf(bytes);
    const number = cad.styleNumber.value;
    if (number) {
      const style = (await styleRepository.byNumber(number)) ?? (await styleRepository.create({ number, description: "Created from CAD (style number read from the CAD header)" }));
      const existing = await prisma.cadExtraction.count({ where: { styleId: style.id } });
      if (!existing) {
        await uploadCad({ styleId: style.id, bytes, fileName: "cad_72232.pdf", user });
        console.log(`cad: style ${number} + CAD extraction stored`);
      } else console.log(`cad: style ${number} already has CAD`);
    }
  }
  console.log("styles:", await prisma.style.count());
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
