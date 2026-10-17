import type {
  CostLine,
  CostingDoc,
  LineField,
  Origin,
  Provenance,
  SourceRef,
} from "@/types/costing";

/**
 * Manual-override behaviour.
 *
 * Rule: a value that came from IMPORT / CAD / MASTER / TEMPLATE / DERIVED / DEFAULT is never lost
 * when a user changes it. The new value becomes the effective one (origin OVERRIDE) and the
 * provenance keeps `original` = the replaced value + its origin/source. Editing an override back to
 * the original value reverts it to the original provenance. Values the user typed into an empty
 * field are MANUAL.
 */

const REPLACEABLE: Origin[] = ["IMPORT", "CAD", "MASTER", "TEMPLATE", "DERIVED", "DEFAULT"];

export interface EditContext {
  by?: string;
  reason?: string;
  now?: () => Date;
}

type Value = number | string | null;

function lineValue(l: CostLine, f: LineField): Value {
  switch (f) {
    case "quantity":
      return l.quantity;
    case "rate":
      return l.rate;
    case "uom":
      return l.uom;
    case "gstRate":
      return l.gstRate;
    case "description":
      return l.description;
    case "item":
      return l.item;
    case "amount":
      return l.amount ?? null;
  }
}

function withValue(l: CostLine, f: LineField, v: Value): CostLine {
  const c: CostLine = { ...l, prov: { ...l.prov } };
  switch (f) {
    case "quantity":
      c.quantity = v as number | null;
      break;
    case "rate":
      c.rate = v as number | null;
      break;
    case "uom":
      c.uom = v as string | null;
      break;
    case "gstRate":
      c.gstRate = v as number | null;
      break;
    case "description":
      c.description = (v as string) ?? "";
      break;
    case "item":
      c.item = (v as string) ?? "";
      break;
    case "amount":
      c.amount = v as number | null;
      break;
  }
  return c;
}

const same = (a: Value, b: Value) => a === b || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-12);

/** Set a field on a line, tracking provenance / overrides. Returns a new document (input untouched). */
export function setLineField<T extends CostingDoc>(
  doc: T,
  lineId: string,
  field: LineField,
  value: Value,
  ctx: EditContext = {},
  origin: Origin = "MANUAL",
  ref?: SourceRef,
): T {
  const at = (ctx.now?.() ?? new Date()).toISOString();
  return {
    ...doc,
    lines: doc.lines.map((l) => {
      if (l.id !== lineId) return l;
      const current = lineValue(l, field);
      const prov = l.prov[field];
      if (same(current, value) && !(origin !== "MANUAL" && prov?.origin !== origin)) return l;
      const next = withValue(l, field, value);

      // Non-user origin (CAD, MASTER, DERIVED, TEMPLATE…): write it, and keep the value it replaced in `original`
      if (origin !== "MANUAL" && origin !== "OVERRIDE") {
        const replaced: Provenance["original"] =
          prov?.original ??
          (prov && REPLACEABLE.includes(prov.origin) && current !== null && current !== undefined && current !== "" && !same(current, value)
            ? { value: current, origin: prov.origin, ref: prov.ref }
            : undefined);
        next.prov[field] = { origin, ref, at, by: ctx.by, reason: ctx.reason, original: replaced };
        return next;
      }

      if (prov?.origin === "OVERRIDE" && prov.original) {
        // Already overridden: keep the very first original; reverting to it clears the override
        if (same(prov.original.value, value)) {
          next.prov[field] = { origin: prov.original.origin, ref: prov.original.ref };
        } else {
          next.prov[field] = { ...prov, at, by: ctx.by, reason: ctx.reason ?? prov.reason };
        }
        return next;
      }
      if (prov && REPLACEABLE.includes(prov.origin) && current !== null && current !== undefined && current !== "") {
        next.prov[field] = {
          origin: "OVERRIDE",
          original: { value: current, origin: prov.origin, ref: prov.ref },
          at,
          by: ctx.by,
          reason: ctx.reason,
        };
        return next;
      }
      next.prov[field] = { origin: "MANUAL", at, by: ctx.by, reason: ctx.reason };
      return next;
    }),
  };
}

/** Restore the original value of an overridden field. */
export function revertOverride<T extends CostingDoc>(doc: T, lineId: string, field: LineField): T {
  return {
    ...doc,
    lines: doc.lines.map((l) => {
      if (l.id !== lineId) return l;
      const p = l.prov[field];
      if (p?.origin !== "OVERRIDE" || !p.original) return l;
      const next = withValue(l, field, p.original.value);
      next.prov[field] = { origin: p.original.origin, ref: p.original.ref };
      return next;
    }),
  };
}

export function isOverridden(l: CostLine, f: LineField): boolean {
  return l.prov[f]?.origin === "OVERRIDE";
}

export function listOverrides(doc: CostingDoc): Array<{ lineId: string; item: string; field: LineField; value: Value; original: Provenance["original"]; by?: string; at?: string }> {
  const out: Array<{ lineId: string; item: string; field: LineField; value: Value; original: Provenance["original"]; by?: string; at?: string }> = [];
  for (const l of doc.lines) {
    for (const [f, p] of Object.entries(l.prov) as Array<[LineField, Provenance]>) {
      if (p.origin === "OVERRIDE") out.push({ lineId: l.id, item: l.item, field: f, value: lineValue(l, f), original: p.original, by: p.by, at: p.at });
    }
  }
  return out;
}

/** Line-level structure edits ─ never delete imported source rows, flag them removed instead. */
export function addLine<T extends CostingDoc>(doc: T, line: CostLine): T {
  return { ...doc, lines: [...doc.lines, { ...line, custom: true }] };
}

export function removeLine<T extends CostingDoc>(doc: T, lineId: string): T {
  const target = doc.lines.find((l) => l.id === lineId);
  if (!target) return doc;
  if (target.custom) return { ...doc, lines: doc.lines.filter((l) => l.id !== lineId) };
  return { ...doc, lines: doc.lines.map((l) => (l.id === lineId ? { ...l, removed: true } : l)) };
}

export function restoreLine<T extends CostingDoc>(doc: T, lineId: string): T {
  return { ...doc, lines: doc.lines.map((l) => (l.id === lineId ? { ...l, removed: false } : l)) };
}
