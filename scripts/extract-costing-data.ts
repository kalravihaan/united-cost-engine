/**
 * Flattens every costing workbook we have into one analysis dataset (JSON), using the engine's own parsers and calculations:
 *   npx tsx scripts/extract-costing-data.ts <dir with the reference files> <out.json>
 * Actual: every sheet of actual_costing*.xlsx. Client: GET sheets, YOUSTA (YAS…) sheets, 2243. Summary: YOUSTA COST SUMMERY.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { parseActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { calculateActualCost } from "@/lib/calculations/actual";
import { calculateClientCost } from "@/lib/calculations/client";
import { groupForLine } from "@/lib/calculations/grouping";
import { DEFAULT_RULES } from "@/data/defaultRules";

const [dir, out] = process.argv.slice(2);
const read = (...p: string[]) => fs.readFileSync(path.join(dir, ...p));

(async () => {
  const data: Record<string, unknown> = {};

  /* ───────── actual ───────── */
  const actual: unknown[] = [];
  for (const file of ["actual_costing.xlsx", "actual_costing_2.xlsx"]) {
    const p = await parseActualWorkbook(read(file), file);
    for (const s of p.sheets) {
      const d = s.doc;
      const r = calculateActualCost(d);
      actual.push({
        file,
        sheet: d.source?.sheet,
        title: d.style.label,
        style: d.style.number,
        colour: d.style.color ?? null,
        orderPcs: d.actual.orderPcs.qty,
        saleRate: d.actual.orderPcs.rate,
        dispatchPcs: d.actual.dispatchPcs.qty,
        consumption: d.actual.consumption.value,
        deduction: d.actual.deduction,
        r: {
          orderSale: r.orderSale, dispatchSale: r.dispatchSale, totalFabricCost: r.totalFabricCost, cmtTotal: r.cmtTotal, totalTrimsCost: r.totalTrimsCost, ldCharges: r.ldCharges,
          totalCost: r.totalCost, costPerPc: r.costPerPc, profit: r.profit, perPcProfit: r.perPcProfit, profitPct: r.profitPct, totalValueLoss: r.totalValueLoss, valueLossPct: r.valueLossPct,
        },
        notes: d.actual.notes,
        lines: d.lines.map((l) => ({
          section: l.sectionKey,
          item: l.item,
          qty: l.quantity,
          rate: l.rate,
          amount: l.sectionKey === "LD_CHARGES" ? l.amount ?? null : null,
          total: r.lineTotals[l.id] ?? 0,
          group: l.sectionKey === "REJECT" ? "Reject" : groupForLine(l, "ACTUAL", DEFAULT_RULES.groupRules)?.group ?? "Unmapped",
        })),
      });
    }
  }
  data.actual = actual;

  /* ───────── client ───────── */
  const client: unknown[] = [];
  const addClient = async (file: string, layout: string, buf: Buffer) => {
    const p = await parseClientWorkbook(buf, file);
    for (const s of p.sheets) {
      const d = s.doc;
      const r = calculateClientCost(d);
      client.push({
        file,
        layout,
        sheet: d.source?.sheet,
        productId: d.style.productId ?? d.style.label,
        style: d.style.number,
        colour: d.style.color ?? null,
        headerNotes: d.client.headerNotes,
        total: r.total.base, totalCost: r.totalCost.base, totalCostWithGst: r.totalCost.withGst, finalPo: r.finalPoPrice,
        tiers: s.overheadTiers.map((t) => ({ name: t.category, rate: t.rate })),
        sections: r.sections.map((x) => ({ key: x.key, label: x.label, phase: x.phase, total: x.total })),
        lines: d.lines.map((l) => ({ section: l.sectionKey, item: l.item, description: l.description, qty: l.quantity, uom: l.uom, rate: l.rate, gst: l.gstRate, calc: l.calc, amount: l.amount ?? null, base: r.lineResults[l.id]?.base ?? 0, attrs: l.attributes })),
      });
    }
  };
  await addClient("client costing.xlsx", "GET", read("client costing.xlsx"));
  for (const f of fs.readdirSync(path.join(dir, "data")).filter((x) => x.endsWith(".xlsx"))) {
    const buf = read("data", f);
    if (buf.subarray(0, 2).toString("latin1") !== "PK") continue; // encrypted files
    await addClient(f, f.startsWith("GET") ? "GET" : f.startsWith("YAS") ? "YOUSTA" : "?", buf);
  }
  await addClient("2243 COSTING.xlsx", "YOUSTA", read("2243 COSTING.xlsx"));
  data.client = client;

  /* ───────── YOUSTA cost summary ───────── */
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(read("YOUSTA COST SUMMERY.xlsx") as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const val = (c: ExcelJS.Cell) => { const v = c.value as unknown; return v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v; };
  const summary: unknown[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    summary.push({ styleNo: val(row.getCell(1)), colour: val(row.getCell(2)), poQty: val(row.getCell(3)), poCost: val(row.getCell(4)), dispatched: val(row.getCell(6)), actualCost: val(row.getCell(8)) });
  });
  data.summary = summary;
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(`actual ${actual.length} · client ${client.length} · summary ${summary.length}`);
})();
