import type { CostingDoc } from "@/types/costing";

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

/** Field-level diff of two costing documents (used for version history – "changed fields"). */
export function diffCostings(prev: CostingDoc | null, next: CostingDoc): FieldChange[] {
  if (!prev) return [{ path: "(new costing)", before: null, after: `${next.lines.length} lines` }];
  const out: FieldChange[] = [];
  const ch = (path: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, before: a ?? null, after: b ?? null });
  };
  const byId = (d: CostingDoc) => new Map(d.lines.map((l) => [l.id, l]));
  const pm = byId(prev);
  const nm = byId(next);
  for (const [id, l] of nm) {
    const p = pm.get(id);
    const name = l.item || l.description || id;
    if (!p) {
      out.push({ path: `line:${id}`, before: null, after: `added "${name}"` });
      continue;
    }
    for (const f of ["item", "description", "quantity", "uom", "rate", "gstRate", "amount", "removed", "itemType"] as const) ch(`${name}.${f}`, p[f], l[f]);
    for (const k of new Set([...Object.keys(p.attributes), ...Object.keys(l.attributes)])) ch(`${name}.${k}`, p.attributes[k], l.attributes[k]);
  }
  for (const [id, p] of pm) if (!nm.has(id)) out.push({ path: `line:${id}`, before: `"${p.item || id}"`, after: null });
  if (prev.type === "ACTUAL" && next.type === "ACTUAL") {
    ch("ORDER PCS", prev.actual.orderPcs, next.actual.orderPcs);
    ch("DISPATCH PCS", prev.actual.dispatchPcs, next.actual.dispatchPcs);
    ch("CONSUMPTION", prev.actual.consumption.value, next.actual.consumption.value);
    ch("deduction", prev.actual.deduction, next.actual.deduction);
  }
  if (prev.type === "CLIENT" && next.type === "CLIENT") {
    ch("category", prev.client.category, next.client.category);
    ch("finance rate", prev.client.finance.rate, next.client.finance.rate);
    ch("transport", prev.client.transport.amount, next.client.transport.amount);
  }
  return out;
}
