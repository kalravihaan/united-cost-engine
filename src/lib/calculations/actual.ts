import type { ActualCosting, ActualResult, CostLine, SectionTotal } from "@/types/costing";
import { active, inSection, n, qtyTimesRate, sum } from "./common";

/**
 * Actual-costing engine – reproduces actual_costing.xlsx.
 *
 *   E8:E13  = C×B                       calculateFabricCost
 *   E16:E17 = C×B                       calculateCMTCost
 *   E19:E34 = C×B                       calculateTrimCost
 *   E37     = SUM(E35,E14,E16,E36)-D4   totalCost
 *   E38     = E37/B3                    cost per pc (dispatch pcs)
 *   E39     = D3-E37                    profit
 *   E41     = C3-E38                    per pc profit
 *   D41     = E41*100/C2 (+D50)         profit %
 *   E44:E47 = B×C                       rejection lines
 *   E49     = SUM(E44:E48)              total value loss
 *   D50     = E49/E37%                  % value loss
 */

export function actualLineTotal(l: CostLine): number {
  if (l.removed) return 0;
  return l.calc === "ENTERED_AMOUNT" ? n(l.amount) : qtyTimesRate(l);
}

export function calculateFabricCost(doc: ActualCosting): number {
  return sum(inSection(doc.lines, "FABRIC_ORDER").map(actualLineTotal));
}

export function calculateCMTCost(doc: ActualCosting): number {
  return sum(inSection(doc.lines, "CMT").map(actualLineTotal));
}

export function calculateTrimCost(doc: ActualCosting): number {
  return sum(inSection(doc.lines, "TRIMS").map(actualLineTotal));
}

/** LD CHARGES (E36) – an entered amount. */
export function calculateLdCharges(doc: ActualCosting): number {
  return sum(inSection(doc.lines, "LD_CHARGES").map(actualLineTotal));
}

/**
 * Packing cost inside the TRIMS block. Which trims are "packing" is a classification, not a source
 * figure, so it is passed in (see data/defaultRules.ts → comparison grouping rules).
 */
export function calculatePackingCost(doc: ActualCosting, isPacking: (l: CostLine) => boolean): number {
  return sum(inSection(doc.lines, "TRIMS").filter(isPacking).map(actualLineTotal));
}

/** Profit block: PROFIT, PER PC PROFIT, profit %. */
export function calculateProfit(args: {
  dispatchSale: number;
  totalCost: number;
  costPerPc: number | null;
  dispatchRate: number | null;
  orderRate: number | null;
  valueLossPct: number | null;
  addValueLossPct: boolean;
}): { profit: number; perPcProfit: number | null; profitPct: number | null } {
  const profit = args.dispatchSale - args.totalCost;
  const perPcProfit = args.costPerPc === null ? null : n(args.dispatchRate) - args.costPerPc;
  let profitPct: number | null = null;
  if (perPcProfit !== null && n(args.orderRate) !== 0) {
    profitPct = (perPcProfit * 100) / n(args.orderRate);
    if (args.addValueLossPct) profitPct += n(args.valueLossPct);
  }
  return { profit, perPcProfit, profitPct };
}

/** REJECT block: Total Value Loss and % value loss (=E49/E37%). */
export function calculateValueLoss(doc: ActualCosting, totalCost: number): { section: SectionTotal; total: number; pct: number | null } {
  const lines = inSection(doc.lines, "REJECT");
  const total = sum(lines.map(actualLineTotal));
  return {
    section: { key: "REJECT", label: "REJECT", total, lineIds: lines.map((l) => l.id) },
    total,
    pct: totalCost === 0 ? null : total / (totalCost / 100),
  };
}

export function calculateActualCost(doc: ActualCosting): ActualResult {
  const a = doc.actual;
  const lineTotals: Record<string, number> = {};
  for (const l of active(doc.lines)) lineTotals[l.id] = actualLineTotal(l);

  const orderSale = n(a.orderPcs.rate) * n(a.orderPcs.qty);
  const dispatchSale = n(a.dispatchPcs.rate) * n(a.dispatchPcs.qty);

  const totalFabricCost = calculateFabricCost(doc);
  const cmtTotal = calculateCMTCost(doc);
  const totalTrimsCost = calculateTrimCost(doc);
  const ldCharges = calculateLdCharges(doc);
  const deduction = n(a.deduction);
  const totalCost = totalTrimsCost + totalFabricCost + cmtTotal + ldCharges - deduction;

  const dispatchQty = n(a.dispatchPcs.qty);
  const costPerPc = dispatchQty > 0 ? totalCost / dispatchQty : null;

  const loss = calculateValueLoss(doc, totalCost);
  const { profit, perPcProfit, profitPct } = calculateProfit({
    dispatchSale,
    totalCost,
    costPerPc,
    dispatchRate: a.dispatchPcs.rate,
    orderRate: a.orderPcs.rate,
    valueLossPct: loss.pct,
    addValueLossPct: a.profitPctAddsValueLossPct,
  });

  const mk = (key: string, label: string): SectionTotal => {
    const ls = inSection(doc.lines, key);
    return { key, label, total: sum(ls.map(actualLineTotal)), lineIds: ls.map((l) => l.id) };
  };

  return {
    type: "ACTUAL",
    orderSale,
    dispatchSale,
    lineTotals,
    sections: [mk("FABRIC_ORDER", "FABRIC ORDER"), mk("CMT", "CMT"), mk("TRIMS", "TRIMS"), mk("LD_CHARGES", "LD CHARGES")],
    totalFabricCost,
    cmtTotal,
    totalTrimsCost,
    ldCharges,
    deduction,
    totalCost,
    costPerPc,
    profit,
    perPcProfit,
    profitPct,
    rejection: loss.section,
    totalValueLoss: loss.total,
    valueLossPct: loss.pct,
    impliedFabricRequirement: a.consumption.value !== null ? a.consumption.value * n(a.orderPcs.qty) : null,
  };
}
