import type { CadData, CostLine, CostingDoc, ValidationIssue } from "@/types/costing";
import { cadEffective, cadUsable } from "@/lib/calculations/cadMapping";
import { cadStyleMatches } from "@/lib/normalization/styleMatching";
import { uomDimension } from "@/lib/normalization/labels";

export interface ValidationContext {
  doc: CostingDoc | null;
  enteredStyleNumber: string;
  customerId?: string | null;
  brandId?: string | null;
  cad: CadData | null;
  /** is a CAD file expected for this workflow (true in the main workflow) */
  cadRequired?: boolean;
}

const issue = (level: ValidationIssue["level"], code: string, message: string, extra: Partial<ValidationIssue> = {}): ValidationIssue => ({ level, code, message, ...extra });

const isFilled = (l: CostLine) => (l.quantity ?? 0) !== 0 || (l.rate ?? 0) !== 0 || (l.amount ?? 0) !== 0;

function lineIssues(doc: CostingDoc, l: CostLine): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const name = l.item || l.description || l.sectionLabel;
  const at = { lineId: l.id };
  if ((l.quantity ?? 0) < 0) out.push(issue("error", "NEGATIVE_QUANTITY", `${name}: quantity is negative (${l.quantity}).`, { ...at, field: "quantity" }));
  if ((l.rate ?? 0) < 0) out.push(issue("error", "NEGATIVE_RATE", `${name}: rate is negative (${l.rate}).`, { ...at, field: "rate" }));
  if ((l.amount ?? 0) < 0) out.push(issue("error", "NEGATIVE_AMOUNT", `${name}: amount is negative.`, { ...at, field: "amount" }));
  if (l.gstRate !== null && l.gstRate !== undefined) {
    if (l.gstRate < 0 || l.gstRate > 1) out.push(issue("error", "INVALID_GST", `${name}: GST ${l.gstRate} is outside 0–1 (enter 12 % as 0.12).`, { ...at, field: "gstRate" }));
  }
  if (!isFilled(l)) return out; // an untouched template slot is not an error

  if (l.calc === "QTY_X_RATE") {
    if (l.quantity === null && (l.rate ?? 0) !== 0) out.push(issue("warning", "QUANTITY_MISSING", `${name}: rate given but quantity is missing.`, { ...at, field: "quantity" }));
    if (l.rate === null && (l.quantity ?? 0) !== 0) out.push(issue("warning", "RATE_MISSING", `${name}: quantity given but rate is missing.`, { ...at, field: "rate" }));
    if ((l.quantity ?? 0) === 0 && (l.rate ?? 0) !== 0) out.push(issue("warning", "QUANTITY_ZERO", `${name}: rate given but quantity is 0 – line contributes nothing.`, { ...at, field: "quantity" }));
    if (doc.type === "CLIENT") {
      const isFabric = l.itemType === "F" || l.sectionKey === "fabric";
      if (!l.uom && (l.quantity ?? 0) !== 0) out.push(issue(isFabric ? "warning" : "info", "UOM_MISSING", `${name}: UOM missing.`, { ...at, field: "uom" }));
      if (l.gstRate === null && (l.rate ?? 0) !== 0) out.push(issue("warning", "GST_MISSING", `${name}: GST is blank (treated as 0 %).`, { ...at, field: "gstRate" }));
    }
  }
  if (l.calc === "PERCENT_OF_SUBTOTAL" && (l.rate ?? 0) > 1) {
    out.push(issue("warning", "PERCENT_SCALE", `${name}: ${l.rate} would be ${(l.rate ?? 0) * 100} % of Total – percentages are stored as fractions (0.08 = 8 %).`, { ...at, field: "rate" }));
  }
  return out;
}

export function validateCosting(ctx: ValidationContext): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  if (!ctx.enteredStyleNumber.trim()) out.push(issue("error", "STYLE_MISSING", "Style number is missing."));
  if (!ctx.customerId) out.push(issue("warning", "CUSTOMER_MISSING", "Customer / brand is not selected."));

  const cad = ctx.cad;
  if (!cad) {
    if (ctx.cadRequired) out.push(issue("warning", "CAD_MISSING", "No CAD uploaded – fabric consumption cannot be taken from CAD."));
  } else {
    const cadStyle = cadEffective(cad.styleNumber);
    const m = cadStyleMatches(ctx.enteredStyleNumber, cadStyle);
    if (m === "MISMATCH") out.push(issue("error", "CAD_STYLE_MISMATCH", `CAD style number "${cadStyle}" does not match the entered style "${ctx.enteredStyleNumber}".`));
    if (m === "UNKNOWN") out.push(issue("warning", "CAD_STYLE_UNKNOWN", "CAD style number could not be read – confirm it belongs to this style."));
    if (cadEffective(cad.width) === null) out.push(issue("warning", "CAD_WIDTH_MISSING", "CAD width missing."));
    if (cadEffective(cad.lengthPerSet) === null) out.push(issue("warning", "CAD_CONSUMPTION_MISSING", "CAD consumption (Length per Set) missing."));
    else if (!cadUsable(cad.lengthPerSet)) out.push(issue("warning", "CAD_CONSUMPTION_UNVERIFIED", "CAD Length per Set needs manual verification before it is used."));
    for (const [k, f] of Object.entries({ length: cad.length, width: cad.width, efficiency: cad.efficiency, lengthPerSet: cad.lengthPerSet, totalLength: cad.totalLength, totalPieces: cad.totalPieces })) {
      if (f.requiresVerification && f.value !== null && !f.manual) out.push(issue("info", "CAD_VERIFY", `CAD ${k}: manual verification required. ${f.notes[0] ?? ""}`.trim(), { field: k }));
    }
  }

  const doc = ctx.doc;
  if (doc) {
    const live = doc.lines.filter((l) => !l.removed);
    // duplicate components (same section + item) – source sheets never repeat an item inside a section
    const seen = new Map<string, CostLine>();
    for (const l of live) {
      const key = `${l.sectionKey}|${l.item.trim().toLowerCase()}`;
      if (!l.item.trim()) continue;
      const prev = seen.get(key);
      if (prev) out.push(issue("warning", "DUPLICATE_COMPONENT", `Duplicate component "${l.item}" in ${l.sectionLabel}.`, { lineId: l.id }));
      else seen.set(key, l);
    }
    for (const l of live) out.push(...lineIssues(doc, l));

    if (doc.type === "ACTUAL") {
      const a = doc.actual;
      if (!a.orderPcs.qty) out.push(issue("error", "ORDER_PCS_MISSING", "ORDER PCS is missing."));
      if (!a.dispatchPcs.qty) out.push(issue("error", "DISPATCH_PCS_MISSING", "DISPATCH PCS is missing – Cost per pc cannot be calculated."));
      if (a.orderPcs.rate === null) out.push(issue("warning", "SALE_RATE_MISSING", "ORDER PCS rate is missing – profit % cannot be calculated."));
      if (a.consumption.value === null) out.push(issue("warning", "CONSUMPTION_MISSING", "Consumption is missing."));
      const fabric = live.find((l) => l.sectionKey === "FABRIC_ORDER" && isFilled(l));
      if (!fabric) out.push(issue("warning", "NO_FABRIC", "No fabric-order line has a quantity or rate."));
    } else {
      const fabricLines = live.filter((l) => l.itemType === "F" || l.sectionKey === "fabric").filter(isFilled);
      if (fabricLines.length === 0) out.push(issue("warning", "NO_FABRIC", "No fabric line has a quantity or rate."));
      for (const l of fabricLines) {
        if (cad && l.attributes.cuttableWidth && cadEffective(cad.width) !== null) {
          const cw = parseFloat(String(l.attributes.cuttableWidth));
          const cadW = cadEffective(cad.width)!;
          if (Number.isFinite(cw) && Math.abs(cw - cadW) > 0.5) {
            out.push(issue("warning", "WIDTH_MISMATCH", `${l.item}: cuttable width ${cw}" differs from CAD width ${cadW}".`, { lineId: l.id, field: "cuttableWidth" }));
          }
        }
        if (l.uom && uomDimension(l.uom) !== "length_m" && l.sectionKey === "fabric" && l.itemType === "F") {
          out.push(issue("info", "FABRIC_UOM", `${l.item}: fabric UOM "${l.uom}" is not a length in metres.`, { lineId: l.id, field: "uom" }));
        }
      }
      if (!doc.client.category) out.push(issue("info", "CATEGORY_MISSING", "No category selected – Overhead+Margin uses the value in the sheet."));
    }
  }
  return out;
}
