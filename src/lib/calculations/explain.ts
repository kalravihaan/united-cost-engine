import type { ActualCosting, ActualResult, ClientCosting, ClientResult, CostingDoc, CostingResult } from "@/types/costing";
import { active, n } from "./common";

export interface ChainStep {
  label: string;
  /** the formula as written in the source workbook (or the equivalent description) */
  formula: string;
  value: number | null;
  /** how the figure is expressed */
  kind: "amount" | "percent" | "count";
  emphasis?: boolean;
  note?: string;
}

/** Human-readable calculation chain – the same order and formulas as the source sheet. */
export function explainCosting(doc: CostingDoc, result: CostingResult): ChainStep[] {
  return doc.type === "ACTUAL" ? explainActual(doc, result as ActualResult) : explainClient(doc, result as ClientResult);
}

function explainActual(doc: ActualCosting, r: ActualResult): ChainStep[] {
  const a = doc.actual;
  return [
    { label: "ORDER PCS sale", formula: "D2 = C2 × B2  (rate × qty)", value: r.orderSale, kind: "amount" },
    { label: "DISPATCH PCS sale", formula: "D3 = C3 × B3", value: r.dispatchSale, kind: "amount" },
    { label: "Total fabric cost", formula: "E14 = SUM(E8:E13)  each line E = C × B", value: r.totalFabricCost, kind: "amount" },
    { label: "CMT", formula: "E16 (+E17 for CMT KURTA / CMT BOTTOM) = C × B", value: r.cmtTotal, kind: "amount" },
    { label: "Total trims cost", formula: "E35 = SUM(E19:E34)", value: r.totalTrimsCost, kind: "amount" },
    { label: "LD CHARGES", formula: "E36 (entered amount)", value: r.ldCharges, kind: "amount" },
    { label: "Deduction", formula: "D4 (subtracted in Total Cost)", value: r.deduction, kind: "amount" },
    { label: "Total Cost", formula: "E37 = SUM(E35, E14, E16, E36) − D4", value: r.totalCost, kind: "amount", emphasis: true },
    { label: "Cost per pc", formula: `E38 = E37 ÷ B3  (DISPATCH PCS ${n(a.dispatchPcs.qty)})`, value: r.costPerPc, kind: "amount", emphasis: true },
    { label: "PROFIT", formula: "E39 = D3 − E37", value: r.profit, kind: "amount" },
    { label: "PER PC PROFIT", formula: "E41 = C3 − E38", value: r.perPcProfit, kind: "amount" },
    {
      label: "profit %",
      formula: a.profitPctAddsValueLossPct ? "D41 = E41 × 100 ÷ C2 + D50  (variant in this sheet)" : "D41 = E41 × 100 ÷ C2",
      value: r.profitPct,
      kind: "percent",
    },
    { label: "Total Value Loss", formula: "E49 = SUM(E44:E48)  each line E = B × C", value: r.totalValueLoss, kind: "amount" },
    { label: "% value loss", formula: "D50 = E49 ÷ E37%", value: r.valueLossPct, kind: "percent" },
  ];
}

function explainClient(doc: ClientCosting, r: ClientResult): ChainStep[] {
  const rej = active(doc.lines).find((l) => l.sectionKey === "garment_rejection");
  const oh = active(doc.lines).find((l) => l.sectionKey === "overhead_margin");
  const steps: ChainStep[] = [
    { label: "Total (Base Total W/o GST Factor)", formula: "L37 = SUM(L2:L36)  each line L = G × K", value: r.total.base, kind: "amount" },
    { label: "Total (With GST)", formula: "M37 = SUM(M2:M36)  each line M = L + O", value: r.total.withGst, kind: "amount" },
  ];
  for (const s of r.sections.filter((x) => x.phase === "POST_TOTAL")) {
    const isPct = doc.lines.some((l) => l.sectionKey === s.key && l.calc === "PERCENT_OF_SUBTOTAL");
    steps.push({ label: s.label, formula: isPct ? "L = Total × K  (percentage of Total; quantity unused)" : "L = G × K", value: s.total, kind: "amount", note: isPct && (s.key === "garment_rejection" ? rej : oh) ? `${(n((s.key === "garment_rejection" ? rej : oh)!.rate) * 100).toFixed(2)}% of Total` : undefined });
  }
  steps.push(
    { label: "Total Cost", formula: "L41 = SUM(L37:L40)", value: r.totalCost.base, kind: "amount", emphasis: true },
    { label: "Input Cost (GST)", formula: "O41 = SUM(O2:O40)  each line O = L × N", value: r.totalCost.gst, kind: "amount" },
    { label: "Total Cost (With GST)", formula: "M41 = SUM(M37:M40)", value: r.totalCost.withGst, kind: "amount" },
    { label: "FOB Price", formula: "L43 = L41", value: r.fobPrice, kind: "amount", emphasis: true },
    { label: "FINANCE COST", formula: `L44 = L43 × ${doc.client.finance.rate}`, value: r.financeCost, kind: "amount", note: doc.client.finance.referenceRate !== null ? `label says ${(doc.client.finance.referenceRate * 100).toFixed(0)}%` : undefined },
    { label: "FINAL PO PRICE", formula: "L45 = L43 − L44", value: r.finalPoPrice, kind: "amount", emphasis: true },
    { label: "Transport", formula: "L57 (entered)", value: r.transport, kind: "amount" },
    { label: "FINAL PO PRICE Incl Transport", formula: "L58 = L45 + L57", value: r.finalPoPriceInclTransport, kind: "amount", emphasis: true },
  );
  return steps;
}
