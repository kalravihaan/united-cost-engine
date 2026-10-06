import type { ClientCosting, ClientLineResult, ClientResult, CostLine } from "@/types/costing";
import { active, n, qtyTimesRate, sum } from "./common";

/**
 * Client-costing engine – reproduces client_costing.xlsx.
 *
 *   L = G×K                         Base Total (W/o GST Factor)       (calc QTY_X_RATE)
 *   L = L37×K                       Garment Rejection / Overhead+Margin (calc PERCENT_OF_SUBTOTAL, quantity unused)
 *   O = L×N                         Input Cost (GST)
 *   M = L+O                         Base Total (With GST)
 *   L37 = SUM(L2:L36)               Total (MAIN phase)
 *   L41 = SUM(L37:L40)              Total Cost
 *   L43 = L41                       FOB Price
 *   L44 = L43×finance factor        Finance Cost
 *   L45 = L43−L44                   FINAL PO PRICE
 *   L58 = L45+L57                   FINAL PO PRICE Incl Transport
 */

export function calculateFinanceCost(fobPrice: number, rate: number): number {
  return fobPrice * rate;
}

/** Source: FINAL PO PRICE = FOB Price − Finance Cost (sign preserved from L45 = L43-L44). */
export function calculateFinalPOPrice(fobPrice: number, financeCost: number): number {
  return fobPrice - financeCost;
}

export function calculateTransport(finalPoPrice: number, transport: number): number {
  return finalPoPrice + transport;
}

function lineBase(l: CostLine, mainSubtotal: number): number {
  switch (l.calc) {
    case "PERCENT_OF_SUBTOTAL":
      return mainSubtotal * n(l.rate);
    case "ENTERED_AMOUNT":
      return n(l.amount);
    default:
      return qtyTimesRate(l);
  }
}

const result = (base: number, gstRate: number | null): ClientLineResult => {
  const gst = base * n(gstRate);
  return { base, gst, withGst: base + gst };
};

export function calculateClientLine(l: CostLine, mainSubtotal: number): ClientLineResult {
  return result(lineBase(l, mainSubtotal), l.gstRate);
}

export function calculateClientCost(doc: ClientCosting): ClientResult {
  const lines = active(doc.lines);
  const phaseOf = (l: CostLine) => doc.client.sections.find((s) => s.key === l.sectionKey)?.phase ?? "MAIN";

  // Pass 1: direct lines of the MAIN phase → the subtotal that percentage lines are based on
  const mainDirect = lines.filter((l) => phaseOf(l) === "MAIN" && l.calc !== "PERCENT_OF_SUBTOTAL");
  const mainSubtotal = sum(mainDirect.map((l) => lineBase(l, 0)));

  const lineResults: Record<string, ClientLineResult> = {};
  for (const l of lines) lineResults[l.id] = calculateClientLine(l, mainSubtotal);

  const agg = (ls: CostLine[]): ClientLineResult => ({
    base: sum(ls.map((l) => lineResults[l.id].base)),
    gst: sum(ls.map((l) => lineResults[l.id].gst)),
    withGst: sum(ls.map((l) => lineResults[l.id].withGst)),
  });

  const mainLines = lines.filter((l) => phaseOf(l) === "MAIN");
  const postLines = lines.filter((l) => phaseOf(l) === "POST_TOTAL");
  const total = agg(mainLines);
  const post = agg(postLines);
  const totalCost: ClientLineResult = {
    base: total.base + post.base,
    gst: total.gst + post.gst,
    withGst: total.withGst + post.withGst,
  };

  const fobPrice = totalCost.base;
  const financeCost = calculateFinanceCost(fobPrice, n(doc.client.finance.rate));
  const finalPoPrice = calculateFinalPOPrice(fobPrice, financeCost);
  const transport = n(doc.client.transport.amount);

  const sections = doc.client.sections.filter((s) => !s.removed).map((s) => {
    const ls = lines.filter((l) => l.sectionKey === s.key);
    const t = agg(ls);
    return { key: s.key, label: s.label, phase: s.phase, total: t.base, gst: t.gst, withGst: t.withGst, lineIds: ls.map((l) => l.id) };
  });
  // lines whose section is not declared (custom category) – keep them visible
  for (const key of new Set(lines.map((l) => l.sectionKey))) {
    if (!sections.find((s) => s.key === key) && !doc.client.sections.some((s) => s.key === key)) {
      const ls = lines.filter((l) => l.sectionKey === key);
      const t = agg(ls);
      sections.push({ key, label: ls[0].sectionLabel, phase: "MAIN", total: t.base, gst: t.gst, withGst: t.withGst, lineIds: ls.map((l) => l.id) });
    }
  }

  return {
    type: "CLIENT",
    lineResults,
    sections,
    total,
    totalCost,
    fobPrice,
    financeCost,
    finalPoPrice,
    transport,
    finalPoPriceInclTransport: calculateTransport(finalPoPrice, transport),
  };
}
