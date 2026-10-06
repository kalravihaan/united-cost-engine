import fs from "node:fs";
import { parseActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { buildActualTemplate, buildClientTemplate } from "@/lib/parsers/templateBuilder";
import { parseCadPdf } from "@/lib/cad/cadParser";
import { renderPdfPreview } from "@/lib/cad/preview";
(async () => {
  const a = buildActualTemplate(await parseActualWorkbook(fs.readFileSync("data/reference/actual_costing.xlsx"), "actual_costing.xlsx"));
  const cs = (await parseClientWorkbook(fs.readFileSync("data/reference/client_costing.xlsx"), "client_costing.xlsx")).sheets[0];
  const c = buildClientTemplate(cs);
  const cad = await parseCadPdf(fs.readFileSync("tests/fixtures/cad_72232.pdf"));
  const prev = await renderPdfPreview(fs.readFileSync("tests/fixtures/cad_72232.pdf"), 1500);
  fs.writeFileSync(process.argv[2], JSON.stringify({ templates: { ACTUAL: a, CLIENT: c }, cad, cadPreview: prev ? "data:image/png;base64," + prev.toString("base64") : null, tiers: cs.overheadTiers.map((t) => ({ name: t.category, rate: t.rate, qty: t.qty, ref: `client_costing.xlsx → ${t.ref.sheet}!${t.ref.cell}` })), uoms: [...new Set([...cs.uomOptions, ...c.lines.map((l) => l.uom).filter(Boolean)])] }));
})();
