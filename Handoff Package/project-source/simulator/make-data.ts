import fs from "node:fs";
import { parseActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { buildActualTemplate, buildClientTemplate, DEFAULT_CLIENT_FORMAT } from "@/lib/parsers/templateBuilder";
import { parseCadPdf } from "@/lib/cad/cadParser";
import { renderPdfPreview } from "@/lib/cad/preview";
(async () => {
  const a = buildActualTemplate([await parseActualWorkbook(fs.readFileSync("data/reference/actual_costing.xlsx"), "actual_costing.xlsx"), await parseActualWorkbook(fs.readFileSync("data/reference/actual_costing_2.xlsx"), "actual_costing_2.xlsx")]);
  const cs = (await parseClientWorkbook(fs.readFileSync("data/reference/client_costing.xlsx"), "client_costing.xlsx")).sheets[0];
  const c = buildClientTemplate(cs);
  // one client layout per customer/brand format (DEFAULT = original GET layout)
  const ys = (await parseClientWorkbook(fs.readFileSync("data/reference/client_costing_YOUSTA.xlsx"), "client_costing_YOUSTA.xlsx")).sheets[0];
  const y2 = (await parseClientWorkbook(fs.readFileSync("data/reference/client_costing_YOUSTA_2243.xlsx"), "client_costing_YOUSTA_2243.xlsx")).sheets;
  const y = buildClientTemplate(ys, "client_costing_YOUSTA.xlsx", { key: "YOUSTA", label: "YOUSTA" }, y2);
  const formats = [{ key: DEFAULT_CLIENT_FORMAT.key, label: DEFAULT_CLIENT_FORMAT.label }, { key: "YOUSTA", label: "YOUSTA" }];
  const cad = await parseCadPdf(fs.readFileSync("tests/fixtures/cad_72232.pdf"));
  const prev = await renderPdfPreview(fs.readFileSync("tests/fixtures/cad_72232.pdf"), 1500);
  fs.writeFileSync(process.argv[2], JSON.stringify({ formats, templates: { ACTUAL: a, CLIENT: c, CLIENT_FORMATS: { DEFAULT: c, YOUSTA: y } }, cad, cadPreview: prev ? "data:image/png;base64," + prev.toString("base64") : null, tiers: cs.overheadTiers.map((t) => ({ name: t.category, rate: t.rate, qty: t.qty, ref: `client_costing.xlsx → ${t.ref.sheet}!${t.ref.cell}` })), uoms: [...new Set([...cs.uomOptions, ...c.lines.map((l) => l.uom).filter(Boolean)])] }));
})();
