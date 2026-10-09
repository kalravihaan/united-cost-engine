import { records, SNAPSHOT, type Snapshot } from "./snapshot";

/** Rows that carry this prefix in `source` are the analysis's standards; user-entered rows never do and are never touched. */
export const STANDARD_SOURCE = "Standard rates";

export interface StandardFabric {
  name: string;
  fabricType: string;
  defaultUom: string;
  lastRate: number;
  source: string;
}
export interface StandardRate {
  costingType: "ACTUAL";
  sectionKey: "FABRIC_ORDER" | "TRIMS" | "CMT";
  itemName: string;
  rate: number;
  uom: string | null;
  source: string;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r2 = (v: number) => Math.round(v * 100) / 100;
const range = (lo: unknown, hi: unknown) => (n(lo) !== null && n(hi) !== null ? ` (range ${r2(n(lo)!)}–${r2(n(hi)!)})` : "");
const pl = (v: unknown, w: string) => `${v} ${w}${v === 1 ? "" : "s"}`;
const FAMILY: Record<string, string> = { "KRTS (GET/YET)": "KRTS", YOUSTA: "YOUSTA" };

/**
 * The analysis's standards as master rows (median of the reference sheets, with the sheet count and range in `source`).
 * Reference values only: nothing in the engine applies them to a costing.
 */
export function standardRateRows(snap: Snapshot = SNAPSHOT): { fabrics: StandardFabric[]; rates: StandardRate[] } {
  const fabrics: StandardFabric[] = [];
  for (const r of records("4 Fabric rates", snap)) {
    const type = String(r.ftype);
    const med = n(r.landed_rate_median);
    if (med === null || type.includes(" + ") || type === "Other") continue; // mixed / unnamed fabrics are not a fabric type
    fabrics.push({ name: type, fabricType: type, defaultUom: "m", lastRate: r2(med), source: `${STANDARD_SOURCE} · landed rate (purchase + finishing), median of ${pl(r.sheets, "sheet")}${range(r.landed_rate_min, r.landed_rate_max)}` });
  }

  const rates: StandardRate[] = [];
  for (const r of records("6 Embellishment", snap)) {
    const med = n(r.rate_median);
    if (med === null) continue;
    rates.push({ costingType: "ACTUAL", sectionKey: "FABRIC_ORDER", itemName: String(r.kind), rate: r2(med), uom: null, source: `${STANDARD_SOURCE} · median of ${pl(r.lines, "costing line")}${range(r.rate_min, r.rate_max)}` });
  }
  for (const r of records("8 Trims rate card", snap)) {
    const med = n(r.rate_median);
    const fam = FAMILY[String(r.family)];
    if (med === null || !fam) continue;
    rates.push({ costingType: "ACTUAL", sectionKey: "TRIMS", itemName: `${r.item} (${fam})`, rate: r2(med * 1000) / 1000, uom: null, source: `${STANDARD_SOURCE} · ${r.family}, median of ${pl(r.sheets, "sheet")}${range(r.rate_min, r.rate_max)}` });
  }
  for (const r of records("7 CMT", snap)) {
    const med = n(r.cmt_pc_median);
    if (med === null) continue;
    rates.push({ costingType: "ACTUAL", sectionKey: "CMT", itemName: `CMT · ${r.segment} · ${r.cluster}`, rate: r2(med), uom: "pc", source: `${STANDARD_SOURCE} · per piece, median of ${pl(r.sheets, "sheet")}${range(r.cmt_pc_min, r.cmt_pc_max)}` });
  }
  return { fabrics, rates };
}
