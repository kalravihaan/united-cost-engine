import type { CadData, CadField, CadAppliedSnapshot, CostingDoc, CostLine } from "@/types/costing";
import type { CadMappingRule } from "@/types/rules";
import { uomDimension } from "@/lib/normalization/labels";
import { setLineField } from "./overrides";

/** Effective value of a CAD field: a user's manual value wins, the extracted value is never discarded. */
export function cadEffective<T>(f: CadField<T>): T | null {
  return f.manual ? f.manual.value : f.value;
}

/** A CAD value is usable for costing when it is confident or the user confirmed/edited it. */
export function cadUsable<T>(f: CadField<T>): boolean {
  return cadEffective(f) !== null && (!f.requiresVerification || !!f.manual);
}

export interface CadApplyOutcome<T extends CostingDoc> {
  doc: T;
  applied: Array<{ ruleId: string; target: string; value: number; unit: string; lineId?: string }>;
  skipped: Array<{ ruleId: string; reason: string }>;
}

function matchesLine(rule: Extract<CadMappingRule["target"], { kind: "LINE_FIELD" }>, l: CostLine): boolean {
  if (l.removed) return false;
  if (rule.sectionKeys && !rule.sectionKeys.includes(l.sectionKey)) return false;
  return new RegExp(rule.itemRegex, "i").test(l.item.trim());
}

/**
 * Feed CAD-derived values into the costing wherever a mapping rule says the field represents consumption.
 * Does not touch any other quantity. Every write carries provenance origin CAD (or OVERRIDE of the prior
 * value, which is kept).
 */
export function applyCadToCosting<T extends CostingDoc>(
  doc: T,
  cad: CadData,
  rules: CadMappingRule[],
  opts: { by?: string; now?: () => Date } = {},
): CadApplyOutcome<T> {
  let out: CostingDoc = doc;
  const applied: CadApplyOutcome<T>["applied"] = [];
  const skipped: CadApplyOutcome<T>["skipped"] = [];
  const snapshotMaps: CadAppliedSnapshot["mappings"] = [];
  const styleNo = cadEffective(cad.styleNumber);
  const at = (opts.now?.() ?? new Date()).toISOString();

  for (const rule of rules.filter((r) => r.costingType === doc.type)) {
    const field = cad[rule.cadField];
    const value = cadEffective(field);
    if (value === null || value === undefined) {
      skipped.push({ ruleId: rule.id, reason: `CAD ${rule.cadField} not available` });
      continue;
    }
    if (!cadUsable(field)) {
      skipped.push({ ruleId: rule.id, reason: `CAD ${rule.cadField} needs manual verification before it can be used` });
      continue;
    }
    const ref = { file: "CAD", note: `CAD → Style ${styleNo ?? "?"} → ${field.raw ?? rule.cadField}` };
    if (rule.target.kind === "ACTUAL_CONSUMPTION" && out.type === "ACTUAL") {
      const prev = out.actual.consumption;
      const overridden = prev.value !== null && prev.value !== value;
      out = {
        ...out,
        actual: {
          ...out.actual,
          consumption: {
            value,
            formula: undefined,
            prov: overridden
              ? { origin: "CAD", original: prev.prov?.original ?? { value: prev.value, origin: prev.prov?.origin ?? "IMPORT", ref: prev.prov?.ref }, ref, at, by: opts.by, reason: "CAD value replaced the existing consumption (original kept)" }
              : { origin: "CAD", ref, at, by: opts.by },
          },
        },
      };
      applied.push({ ruleId: rule.id, target: "Consumption", value, unit: "m" });
      snapshotMaps.push({ target: "Consumption", cadField: rule.cadField, value, unit: "m" });
      continue;
    }
    if (rule.target.kind === "LINE_FIELD") {
      const target = out.lines.filter((l) => matchesLine(rule.target as never, l));
      if (target.length === 0) {
        skipped.push({ ruleId: rule.id, reason: `no line matches /${rule.target.itemRegex}/` });
        continue;
      }
      for (const l of target) {
        if (rule.requireUomDimension && l.uom && uomDimension(l.uom) !== rule.requireUomDimension) {
          skipped.push({ ruleId: rule.id, reason: `UOM "${l.uom}" of ${l.item} is not a length in metres` });
          continue;
        }
        // setLineField keeps the replaced imported value in provenance.original
        out = setLineField(out, l.id, "quantity", value, { by: opts.by, now: () => new Date(at) }, "CAD", ref);
        applied.push({ ruleId: rule.id, target: `${l.item} quantity`, value, unit: "m", lineId: l.id });
        snapshotMaps.push({ target: `${l.item} quantity`, cadField: rule.cadField, value, unit: "m" });
      }
    }
  }

  out = {
    ...out,
    cadApplied: {
      styleNumber: styleNo,
      lengthPerSet: cadEffective(cad.lengthPerSet),
      width: cadEffective(cad.width),
      appliedAt: at,
      mappings: snapshotMaps,
    },
  };
  return { doc: out as T, applied, skipped };
}
