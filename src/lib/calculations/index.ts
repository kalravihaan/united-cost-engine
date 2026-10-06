import type { CostingDoc, CostingResult } from "@/types/costing";
import { calculateActualCost } from "./actual";
import { calculateClientCost } from "./client";

export * from "./actual";
export * from "./client";
export * from "./comparison";
export * from "./grouping";
export * from "./overrides";
export * from "./cadMapping";
export * from "./template";
export * from "./diff";

/** Recorded with every saved version so a number can be traced to the engine that produced it. */
export const ENGINE_VERSION = "1.0.0";

export function calculateCosting(doc: CostingDoc): CostingResult {
  return doc.type === "ACTUAL" ? calculateActualCost(doc) : calculateClientCost(doc);
}

/** Headline numbers used for listings / indexes. */
export function headline(doc: CostingDoc, result: CostingResult): { totalCost: number | null; costPerPc: number | null; finalPoPrice: number | null } {
  if (result.type === "ACTUAL") return { totalCost: result.totalCost, costPerPc: result.costPerPc, finalPoPrice: null };
  void doc;
  return { totalCost: result.totalCost.base, costPerPc: result.totalCost.base, finalPoPrice: result.finalPoPriceInclTransport };
}
export * from "./explain";
