import type { CostLine } from "@/types/costing";

/** Spreadsheet semantics: blank → 0. */
export const n = (x: number | null | undefined): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Lines that take part in calculations (removed imported lines are kept in the doc but excluded). */
export const active = (lines: CostLine[]): CostLine[] => lines.filter((l) => !l.removed);

export function inSection(lines: CostLine[], ...keys: string[]): CostLine[] {
  return active(lines).filter((l) => keys.includes(l.sectionKey));
}

/** quantity × rate – the relationship used by every line of the actual sheets and most client lines. */
export function qtyTimesRate(l: Pick<CostLine, "quantity" | "rate">): number {
  return n(l.quantity) * n(l.rate);
}
