import type { CostLine, CostingDoc, Provenance } from "@/types/costing";

/**
 * Start a costing for a style that has none by reusing the *structure* of an existing costing.
 * mode STRUCTURE: quantities/rates blank (nothing is carried over silently).
 * mode VALUES: values copied and marked origin TEMPLATE so they stay visibly "to verify".
 */
export function createFromTemplate<T extends CostingDoc>(
  template: T,
  style: { number: string; label?: string; color?: string },
  mode: "STRUCTURE" | "VALUES",
  now: () => Date = () => new Date(),
): T {
  const at = now().toISOString();
  const refNote = `Template: ${template.source?.sheet ?? template.style.number} (${template.source?.file ?? "stored costing"})`;
  const lines: CostLine[] = template.lines
    .filter((l) => !l.removed)
    .map((l) => {
      const prov: CostLine["prov"] = {};
      const keep = mode === "VALUES";
      // fixed percentages of a named customer layout travel with the structure (flagged TEMPLATE)
      const keepRate = keep || l.prov.rate?.origin === "TEMPLATE";
      const mark = (f: keyof CostLine["prov"], has: boolean): Provenance | undefined => (keep && has ? { origin: "TEMPLATE", ref: { note: refNote }, at } : undefined);
      const c: CostLine = {
        ...l,
        quantity: keep ? l.quantity : null,
        rate: keepRate ? l.rate : null,
        amount: keep ? l.amount : l.amount === undefined ? undefined : null,
        description: keep ? l.description : "",
        prov,
        attributes: keep ? { ...l.attributes } : Object.fromEntries(Object.entries(l.attributes).map(([k, v]) => [k, ["hsCode", "duty", "gstSource"].includes(k) ? v : null])),
        sourceFormula: l.sourceFormula,
        sourceRef: { ...l.sourceRef, note: refNote },
        custom: false,
        removed: false,
      };
      // GST rates and UOMs are part of the structure of a line, keep them (flagged as template)
      const q = mark("quantity", c.quantity !== null);
      if (q) prov.quantity = q;
      if (keepRate && c.rate !== null) prov.rate = { origin: "TEMPLATE", ref: { note: refNote }, at };
      if (c.gstRate !== null) prov.gstRate = { origin: "TEMPLATE", ref: { note: refNote }, at };
      if (c.uom) prov.uom = { origin: "TEMPLATE", ref: { note: refNote }, at };
      const a = mark("amount", c.amount !== null && c.amount !== undefined);
      if (a) prov.amount = a;
      return c;
    });
  const base = {
    ...template,
    style: { number: style.number, label: style.label ?? style.number, color: style.color },
    lines,
    source: undefined,
    cadApplied: undefined,
    issues: [{ level: "info" as const, code: "FROM_TEMPLATE", message: `Created from ${refNote} (${mode === "VALUES" ? "values copied – verify" : "structure only"}).` }],
  };
  if (base.type === "ACTUAL") {
    const t = template as Extract<CostingDoc, { type: "ACTUAL" }>;
    return {
      ...base,
      actual: {
        ...t.actual,
        orderPcs: mode === "VALUES" ? { ...t.actual.orderPcs } : { qty: null, rate: null },
        dispatchPcs: mode === "VALUES" ? { ...t.actual.dispatchPcs } : { qty: null, rate: null },
        consumption: { value: mode === "VALUES" ? t.actual.consumption.value : null },
        deduction: mode === "VALUES" ? t.actual.deduction : 0,
        notes: [],
      },
    } as unknown as T;
  }
  const c = template as Extract<CostingDoc, { type: "CLIENT" }>;
  return {
    ...base,
    client: {
      ...c.client,
      headerNotes: [...c.client.headerNotes],
      transport: mode === "VALUES" ? { ...c.client.transport } : { amount: 0 },
      finance: { ...c.client.finance },
    },
  } as unknown as T;
}
