import { z } from "zod";

/**
 * Structural validation of costing documents arriving over the API. Deliberately lenient about
 * optional detail (provenance, attributes) but strict about what the engine relies on.
 */
const num = z.number().finite().nullable();

const lineSchema = z
  .object({
    id: z.string().min(1),
    sectionKey: z.string().min(1),
    sectionLabel: z.string(),
    item: z.string(),
    description: z.string(),
    itemType: z.string().nullable(),
    quantity: num,
    uom: z.string().nullable(),
    rate: num,
    gstRate: num,
    currency: z.string(),
    calc: z.enum(["QTY_X_RATE", "PERCENT_OF_SUBTOTAL", "ENTERED_AMOUNT"]),
    amount: num.optional(),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    prov: z.record(z.string(), z.unknown()),
    removed: z.boolean().optional(),
    custom: z.boolean().optional(),
  })
  .passthrough();

const base = {
  schemaVersion: z.literal(1),
  style: z.object({ number: z.string().min(1), label: z.string() }).passthrough(),
  currency: z.string(),
  lines: z.array(lineSchema).max(2000),
  issues: z.array(z.unknown()),
};

const qtyRate = z.object({ qty: num, rate: num });

export const costingDocSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("ACTUAL"),
    actual: z
      .object({
        orderPcs: qtyRate,
        dispatchPcs: qtyRate,
        consumption: z.object({ value: num }).passthrough(),
        deduction: z.number().finite(),
        profitPctAddsValueLossPct: z.boolean(),
        notes: z.array(z.string()),
      })
      .passthrough(),
  }).passthrough(),
  z.object({
    ...base,
    type: z.literal("CLIENT"),
    client: z
      .object({
        headerNotes: z.array(z.string()),
        category: z.string().nullable(),
        sections: z.array(z.object({ key: z.string(), label: z.string(), phase: z.enum(["MAIN", "POST_TOTAL"]) })),
        finance: z.object({ rate: z.number().finite() }).passthrough(),
        transport: z.object({ amount: z.number().finite() }).passthrough(),
      })
      .passthrough(),
  }).passthrough(),
]);
