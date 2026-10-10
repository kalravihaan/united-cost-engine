import type { ActualCosting, ActualResult, CostLine } from "@/types/costing";
import type { RuleSet } from "@/types/rules";
import { actualLineTotal } from "@/lib/calculations/actual";
import { active, n } from "@/lib/calculations/common";
import { groupForLine } from "@/lib/calculations/grouping";
import { records, SNAPSHOT, type Rec, type Snapshot } from "./snapshot";

/**
 * Benchmarks: where one Actual costing sits against the standards derived from the 58 reference sheets
 * (docs/COST_ANALYSIS.md). Read-only guidance: nothing here changes a costing.
 */
export type BenchStatus = "below" | "within" | "above" | "na";

export interface BenchRow {
  key: string;
  label: string;
  unit: string;
  value: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  status: BenchStatus;
  /** sheets behind the standard (small n = indicative only) */
  n: number | null;
  note?: string;
}

export interface BenchReport {
  segment: string;
  embellished: boolean;
  cluster: string;
  fabricType: string | null;
  rows: BenchRow[];
  /** The standard has no data for this segment (e.g. a brand that is not in the reference sheets) */
  noStandard: boolean;
}

export function segmentFor(styleNumber: string, clientFormat?: string | null, brand?: string | null): string {
  const s = styleNumber.toUpperCase();
  if (clientFormat === "YOUSTA" || /YOUSTA/i.test(brand ?? "") || s.startsWith("YAS")) return "YOUSTA";
  const m = s.match(/KRTS(FUT|CUT)/);
  if (m) return m[1] === "FUT" ? "Live Smart 4xxx/6xxx (FUT)" : "Live Smart 5xxx (CUT)";
  const d = s.match(/(\d+)\s*$/)?.[1] ?? "";
  if (d.length === 4 && d[0] === "5") return "Live Smart 5xxx (CUT)";
  if (d.length === 4 && (d[0] === "4" || d[0] === "6")) return "Live Smart 4xxx/6xxx (FUT)";
  // the brand / layout says Live Smart (the GET layout) although the number is not one of its series: nearest series by first digit
  if (/live ?smart/i.test(brand ?? "") || clientFormat === "DEFAULT") return d[0] === "5" ? "Live Smart 5xxx (CUT)" : "Live Smart 4xxx/6xxx (FUT)";
  return "YOUSTA"; // 5-digit and 0xxx–3xxx styles are the YOUSTA numbering
}

export function fabricTypeOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("schiffli")) return "Cotton slub (schiffli)";
  if (n.includes("slub") && n.includes("rayon")) return "Rayon slub";
  if (n.includes("slub")) return "Cotton slub";
  if (n.includes("flex")) return "Cotton flex";
  if (/poly\s*cotton/.test(n)) return "Poly cotton";
  if (/40\s*x\s*30|cotton/.test(n)) return "Cotton 40x30";
  if (n.includes("rayon")) return "Rayon";
  if (/pst|gadhwal/.test(n)) return "PST / Gadhwal";
  return "Other";
}

const num = (v: Rec[string] | undefined): number | null => (typeof v === "number" ? v : null);

function status(value: number | null, low: number | null, high: number | null): BenchStatus {
  if (value === null || low === null || high === null) return "na";
  return value < low ? "below" : value > high ? "above" : "within";
}

/** Band around a median when the analysis keeps only the median (±15 %). */
const band = (mid: number | null, tol = 0.15): [number | null, number | null] => (mid === null ? [null, null] : [mid * (1 - tol), mid * (1 + tol)]);

export function benchmarkActual(input: { styleNumber: string; clientFormat?: string | null; brand?: string | null; doc: ActualCosting; result: ActualResult; rules: RuleSet }, snap: Snapshot = SNAPSHOT): BenchReport {
  const { doc, result, rules } = input;
  const dispatch = n(doc.actual.dispatchPcs.qty);
  const per = (x: number) => (dispatch > 0 ? x / dispatch : null);
  const segment = segmentFor(input.styleNumber, input.clientFormat, input.brand);
  const family = segment === "YOUSTA" ? "YOUSTA" : "Live Smart";

  const groups = new Map<string, number>();
  const fabricLines: CostLine[] = [];
  for (const l of active(doc.lines)) {
    if (l.sectionKey === "REJECT") continue;
    const g = groupForLine(l, "ACTUAL", rules.groupRules)?.group ?? "Unmapped";
    groups.set(g, (groups.get(g) ?? 0) + actualLineTotal(l));
    if (l.sectionKey === "FABRIC_ORDER" && g === "Fabric" && n(l.quantity) > 0 && n(l.rate) > 0) fabricLines.push(l);
  }
  const embPc = per(groups.get("Embellishment") ?? 0);
  const embellished = (embPc ?? 0) > 1;
  const cmtPc = per(result.cmtTotal);

  // fabric: main line = most metres; landed rate includes finishing / printing billed as a second line
  const main = [...fabricLines].sort((a, b) => n(b.quantity) - n(a.quantity))[0];
  const fabricTotal = fabricLines.reduce((s, l) => s + actualLineTotal(l), 0);
  const landed = main && n(main.quantity) > 0 ? fabricTotal / n(main.quantity) : null;
  const purchasedPerPc = main && dispatch > 0 ? n(main.quantity) / dispatch : null;
  const fabricType = main ? fabricTypeOf(`${main.item} ${main.description ?? ""}`) : null;
  const cons = doc.actual.consumption.value;
  const cluster = (cons ?? purchasedPerPc ?? 0) >= 2.2 ? "Set / long (≥2.2 m)" : "Kurta / top";

  const stds = records("3 Standard cost", snap).filter((r) => r.segment === segment);
  const exact = stds.find((r) => r.embellished === (embellished ? "embellished" : "plain"));
  // some segments have no sheets of one kind (e.g. no plain FUT sheet): compare with what exists and say so
  const std = exact ?? stds[0];
  const stdNote = exact || !std ? undefined : `no ${embellished ? "embellished" : "plain"} sheet in this segment: compared with ${String(std.embellished)} sheets`;
  const cmtStd = records("7 CMT", snap).find((r) => r.segment === segment && r.cluster === cluster);
  const fabStd = records("4 Fabric rates", snap).find((r) => r.ftype === fabricType);
  const consStd = records("5 Consumption", snap).find((r) => r.family === family);
  const tier = records("9 Sale price tiers", snap).find((r) => r.segment === segment);

  const rows: BenchRow[] = [];
  const add = (key: string, label: string, unit: string, value: number | null, low: number | null, mid: number | null, high: number | null, nn: number | null, note?: string) =>
    rows.push({ key, label, unit, value, low, mid, high, status: status(value, low, high), n: nn, note });

  add("cost", "Cost per piece", "₹/pc", result.costPerPc, num(std?.cost_min), num(std?.cost_per_pc), num(std?.cost_max), num(std?.sheets), ["range = cheapest to dearest sheet of the segment", stdNote].filter(Boolean).join(" · "));
  const [fl, fh] = band(num(std?.fabric_pc));
  add("fabric", "Fabric per piece (purchase + finishing)", "₹/pc", per(groups.get("Fabric") ?? 0), fl, num(std?.fabric_pc), fh, num(std?.sheets), "median ±15 %");
  if (embellished || (num(std?.embellishment_pc) ?? 0) > 0) {
    const [el, eh] = band(num(std?.embellishment_pc), 0.3);
    add("emb", "Embellishment per piece", "₹/pc", embPc, el, num(std?.embellishment_pc), eh, num(std?.sheets), "median ±30 %");
  }
  add("cmt", "CMT per piece", "₹/pc", cmtPc, num(cmtStd?.cmt_pc_min), num(cmtStd?.cmt_pc_median), num(cmtStd?.cmt_pc_max), num(cmtStd?.sheets), `${cluster}`);
  add("landed", `Landed fabric rate${fabricType ? ` (${fabricType})` : ""}`, "₹/m", landed, num(fabStd?.landed_rate_min), num(fabStd?.landed_rate_median), num(fabStd?.landed_rate_max), num(fabStd?.sheets), fabricType === "Other" ? "name the fabric (e.g. cotton slub, 40x30 cotton) to compare its rate" : "(purchase + finishing) ÷ metres purchased");
  add("consumption", "Consumption cell", "m/pc", cons, num(consStd?.cell_min), num(consStd?.cell_median), num(consStd?.cell_max), num(consStd?.sheets), "the costing's own CONSUMPTION figure");
  const allowance = cons && purchasedPerPc ? ((purchasedPerPc - cons) / cons) * 100 : null;
  const am = num(consStd?.allowance_pct_median);
  add("allowance", "Purchased metres above consumption", "%", allowance, am === null ? null : Math.max(0, am - 5), am, am === null ? null : am + 6, num(consStd?.sheets), "purchased m/pc ÷ consumption cell − 1; large gaps mean the cell is a carried-over default");
  add("sale", "Sale rate", "₹/pc", doc.actual.dispatchPcs.rate, num(tier?.min), num(tier?.median), num(tier?.max), num(tier?.count));
  add("profit", "Profit % (as the sheet computes it)", "%", result.profitPct, null, num(std?.profit_pct), null, num(std?.sheets), "value loss is not deducted from profit in the source sheets");
  rows[rows.length - 1].status = "na";

  return { segment, embellished, cluster, fabricType, rows, noStandard: !std };
}
