import type { ActualCosting, ActualResult, ClientCosting, ClientResult, CostLine } from "@/types/costing";
import type { RuleSet } from "@/types/rules";
import { actualLineTotal } from "./actual";
import { active, n } from "./common";
import { groupForLine, UNMAPPED_GROUP } from "./grouping";

export interface ComparisonRow {
  group: string;
  actualPerPc: number;
  clientPerPc: number;
  differencePerPc: number;
  /** (client − actual) / actual × 100; null when actual is 0 */
  premiumPct: number | null;
  actualTotal: number;
  clientTotal: number;
  differenceTotal: number;
  actualLineIds: string[];
  clientLineIds: string[];
}

export interface ComparisonResult {
  /** Pieces used to scale client per-pc to totals = actual DISPATCH PCS */
  pieces: number;
  rows: ComparisonRow[];
  unmapped: { actual: CostLine[]; client: CostLine[] };
  totals: {
    actualPerPc: number | null;
    clientPerPc: number;
    differencePerPc: number | null;
    premiumPct: number | null;
    actualTotal: number;
    clientTotal: number;
    differenceTotal: number;
  };
  /** Distinct economics, not mixed: actual profit is sale − cost; client margin is the Overhead+Margin line */
  margin: {
    actualProfit: number;
    actualPerPcProfit: number | null;
    actualProfitPct: number | null;
    actualSaleRatePerPc: number | null;
    clientOverheadMarginPerPc: number;
    clientOverheadMarginRate: number | null;
  };
  clientPriceChain: {
    fobPrice: number;
    /** false for layouts that have no finance / transport rows (final price = Total Cost) */
    hasFinance: boolean;
    hasTransport: boolean;
    finalPriceLabel: string;
    financeCost: number;
    finalPoPrice: number;
    transport: number;
    finalPoPriceInclTransport: number;
  };
  notes: string[];
}

const pct = (diff: number, base: number): number | null => (base === 0 ? null : (diff * 100) / base);

/**
 * Compare an Actual and a Client costing for the same style, computed from both underlying line sets.
 * Basis: Base Total (W/o GST Factor) on the client side (the figure that feeds FOB Price); actual figures are
 * PURCHASE values divided by DISPATCH PCS (the same denominator as the source "Cost per pc").
 */
export function compareCostings(
  actual: ActualCosting,
  actualResult: ActualResult,
  client: ClientCosting,
  clientResult: ClientResult,
  rules: RuleSet,
): ComparisonResult {
  const dispatch = n(actual.actual.dispatchPcs.qty);
  const pieces = dispatch;
  const per = (x: number) => (dispatch > 0 ? x / dispatch : 0);

  const acc = new Map<string, { a: number; c: number; aIds: string[]; cIds: string[] }>();
  const slot = (g: string) => {
    let s = acc.get(g);
    if (!s) acc.set(g, (s = { a: 0, c: 0, aIds: [], cIds: [] }));
    return s;
  };
  const unmapped = { actual: [] as CostLine[], client: [] as CostLine[] };

  for (const l of active(actual.lines)) {
    if (l.sectionKey === "REJECT") continue; // value loss is outside Total Cost in the source
    const g = groupForLine(l, "ACTUAL", rules.groupRules);
    const name = g?.group ?? UNMAPPED_GROUP;
    if (!g) unmapped.actual.push(l);
    const s = slot(name);
    s.a += actualLineTotal(l);
    s.aIds.push(l.id);
  }
  if (n(actualResult.deduction) !== 0) {
    const s = slot("Deduction");
    s.a -= actualResult.deduction;
  }
  for (const l of active(client.lines)) {
    const g = groupForLine(l, "CLIENT", rules.groupRules);
    const name = g?.group ?? UNMAPPED_GROUP;
    if (!g) unmapped.client.push(l);
    const s = slot(name);
    s.c += clientResult.lineResults[l.id]?.base ?? 0;
    s.cIds.push(l.id);
  }

  const order = [...rules.groupOrder, ...[...acc.keys()].filter((k) => !rules.groupOrder.includes(k))];
  const rows: ComparisonRow[] = order
    .filter((g) => acc.has(g))
    .map((g) => {
      const s = acc.get(g)!;
      const actualPerPc = per(s.a);
      const clientPerPc = s.c;
      return {
        group: g,
        actualPerPc,
        clientPerPc,
        differencePerPc: clientPerPc - actualPerPc,
        premiumPct: pct(clientPerPc - actualPerPc, actualPerPc),
        actualTotal: s.a,
        clientTotal: clientPerPc * pieces,
        differenceTotal: clientPerPc * pieces - s.a,
        actualLineIds: s.aIds,
        clientLineIds: s.cIds,
      };
    });

  const actualPerPc = actualResult.costPerPc;
  const clientPerPc = clientResult.totalCost.base;
  const ohLine = active(client.lines).find((l) => l.sectionKey === "overhead_margin");
  const notes: string[] = [
    `Per-piece figures: actual = PURCHASE ÷ DISPATCH PCS (${dispatch}); client = Base Total (W/o GST Factor) per piece.`,
    "Client totals are client per-piece cost × actual dispatch pieces.",
    "Actual Total Cost excludes REJECT value loss (as in the source); it is reported separately in the Actual view.",
  ];
  if (unmapped.actual.length || unmapped.client.length) notes.push("Some lines match no grouping rule and are listed under 'Unmapped' – configure Masters → Costing Rules.");

  return {
    pieces,
    rows,
    unmapped,
    totals: {
      actualPerPc,
      clientPerPc,
      differencePerPc: actualPerPc === null ? null : clientPerPc - actualPerPc,
      premiumPct: actualPerPc === null ? null : pct(clientPerPc - actualPerPc, actualPerPc),
      actualTotal: actualResult.totalCost,
      clientTotal: clientPerPc * pieces,
      differenceTotal: clientPerPc * pieces - actualResult.totalCost,
    },
    margin: {
      actualProfit: actualResult.profit,
      actualPerPcProfit: actualResult.perPcProfit,
      actualProfitPct: actualResult.profitPct,
      actualSaleRatePerPc: actual.actual.dispatchPcs.rate,
      clientOverheadMarginPerPc: ohLine ? clientResult.lineResults[ohLine.id]?.base ?? 0 : 0,
      clientOverheadMarginRate: ohLine ? ohLine.rate : null,
    },
    clientPriceChain: {
      fobPrice: clientResult.fobPrice,
      hasFinance: client.client.pricing?.finance ?? true,
      hasTransport: client.client.pricing?.transport ?? true,
      finalPriceLabel: client.client.pricing?.finalPriceLabel ?? "FINAL PO PRICE",
      financeCost: clientResult.financeCost,
      finalPoPrice: clientResult.finalPoPrice,
      transport: clientResult.transport,
      finalPoPriceInclTransport: clientResult.finalPoPriceInclTransport,
    },
    notes,
  };
}
