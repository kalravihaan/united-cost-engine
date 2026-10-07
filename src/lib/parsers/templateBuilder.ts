import type { ActualCosting, ClientCosting, ClientFormat, CostLine } from "@/types/costing";
import { collapse, slug } from "@/lib/normalization/labels";
import { groupForLine } from "@/lib/calculations/grouping";
import { DEFAULT_RULES } from "@/data/defaultRules";
import type { ParsedActualWorkbook } from "./actualCostingParser";
import type { ParsedClientSheet } from "./clientCostingParser";

/**
 * Default costing templates.
 *
 * The reference workbooks are used ONLY to learn the structure (which headers and rows each costing mode
 * has). No quantities, rates or style data are carried over. The result is stored as an editable template
 * (Masters → Costing Templates); every new costing starts with all of its rows and the user removes what a
 * style does not need.
 */

const blankLine = (l: Pick<CostLine, "sectionKey" | "sectionLabel" | "item" | "calc"> & Partial<CostLine>, id: string, ref: string): CostLine => ({
  id,
  itemType: null,
  description: "",
  quantity: null,
  uom: null,
  rate: null,
  gstRate: null,
  currency: "INR",
  attributes: {},
  prov: {},
  sourceRef: { note: ref },
  ...l,
});

/** Union of labels, case-insensitive, most frequent spelling wins, ordered by (first row position, frequency). */
function unionLabels(rows: Array<Array<{ label: string; pos: number }>>): string[] {
  const acc = new Map<string, { spell: Map<string, number>; pos: number; n: number }>();
  for (const r of rows)
    for (const { label, pos } of r) {
      const key = collapse(label).toLowerCase();
      if (!key) continue;
      const e = acc.get(key) ?? { spell: new Map(), pos, n: 0 };
      e.spell.set(collapse(label), (e.spell.get(collapse(label)) ?? 0) + 1);
      e.pos = Math.min(e.pos, pos);
      e.n++;
      acc.set(key, e);
    }
  return [...acc.values()]
    .map((e) => ({ label: [...e.spell.entries()].sort((x, y) => y[1] - x[1])[0][0], pos: e.pos, n: e.n }))
    // generic placeholder slots ("trims 6") go last; otherwise keep sheet order, then most-used first
    .sort((a, b) => Number(/^trims? \d+$/i.test(a.label)) - Number(/^trims? \d+$/i.test(b.label)) || a.pos - b.pos || b.n - a.n)
    .map((e) => e.label);
}

export function buildActualTemplate(parsed: ParsedActualWorkbook, fileName = parsed.fileName): ActualCosting {
  const ref = `Reference: ${fileName}`;
  const lines: CostLine[] = [];
  const add = (key: string, label: string, item: string, calc: CostLine["calc"] = "QTY_X_RATE") => lines.push(blankLine({ sectionKey: key, sectionLabel: label, item, calc }, `${key}:${slug(item)}`, ref));

  // FABRIC ORDER: fabric slots + the add-on rows (embroidery, lace, tassels …) seen in the reference sheets
  const addOns = parsed.sheets.map((s) =>
    s.doc.lines
      .filter((l, i) => l.sectionKey === "FABRIC_ORDER" && groupForLine(l, "ACTUAL", DEFAULT_RULES.groupRules)?.group !== "Fabric" && (l.item || i >= 0))
      .map((l, i) => ({ label: l.item, pos: i })),
  );
  ["Fabric 1", "Fabric 2", "Fabric 3"].forEach((f) => add("FABRIC_ORDER", "FABRIC ORDER", f));
  for (const label of unionLabels(addOns)) add("FABRIC_ORDER", "FABRIC ORDER", label);

  const lab = (key: string) => parsed.sheets.map((s) => s.doc.lines.filter((l) => l.sectionKey === key).map((l, i) => ({ label: l.item, pos: i })));
  for (const label of unionLabels(lab("CMT"))) add("CMT", "CMT", label);
  for (const label of unionLabels(lab("TRIMS"))) add("TRIMS", "TRIMS", label);
  add("LD_CHARGES", "LD CHARGES", "LD CHARGES", "ENTERED_AMOUNT");
  for (const label of unionLabels(lab("REJECT"))) add("REJECT", "REJECT", label);

  return {
    schemaVersion: 1,
    type: "ACTUAL",
    style: { number: "TEMPLATE", label: "Actual costing template" },
    currency: "INR",
    lines,
    issues: [],
    actual: { orderPcs: { qty: null, rate: null }, dispatchPcs: { qty: null, rate: null }, consumption: { value: null }, deduction: 0, profitPctAddsValueLossPct: false, notes: [], removedSections: [] },
  };
}

export const DEFAULT_CLIENT_FORMAT: ClientFormat = { key: "DEFAULT", label: "Standard layout (GET)" };

/** Vendor / brand memo lines are part of a customer's layout; per-style measurement notes ("L - 44\"") are not. */
const isLayoutNote = (n: string) => /^(brand|vendor)\b/i.test(n) || /^[A-Z0-9 .&/-]{6,}$/.test(n) && !/^(XXL|XL|L|M|S|BO?)\s*[-–]/i.test(n);

/**
 * `format` names the customer layout the reference sheet follows (default: the original GET layout). A non-default
 * format also keeps the fixed percentages of its post-total rows (Garment Rejection, Overhead+Margin) as TEMPLATE defaults.
 */
export function buildClientTemplate(sheet: ParsedClientSheet, fileName = sheet.doc.source?.file ?? "client costing.xlsx", format: ClientFormat = DEFAULT_CLIENT_FORMAT): ClientCosting {
  const ref = `Reference: ${fileName}`;
  const src = sheet.doc;
  // a named customer layout keeps the wording / sheet name / upload sheet of the customer's own workbook for its Excel output
  if (format.key !== DEFAULT_CLIENT_FORMAT.key) format = { ...format, export: { sheetName: src.source?.sheet, headers: sheet.headerLabels, updateSheet: !!sheet.updateSheet } };
  // stray unnamed value rows of a customer sheet (no item, no description) are not structure
  const lines: CostLine[] = src.lines.filter((l) => l.item || l.description || l.calc !== "QTY_X_RATE").map((l, i) => ({
    ...blankLine({ sectionKey: l.sectionKey, sectionLabel: l.sectionLabel, item: l.item, calc: l.calc }, `${l.sectionKey}:${slug(l.item || l.description || String(i))}${i}`, ref),
    itemType: l.itemType,
    uom: l.uom,
    gstRate: l.gstRate,
    currency: l.currency,
    description: "",
    // structural percentages (Garment Rejection / Overhead+Margin) are entered per style; category sets Overhead+Margin.
    // A named customer layout has fixed percentages: kept as visible TEMPLATE defaults.
    rate: format.key !== DEFAULT_CLIENT_FORMAT.key && l.calc === "PERCENT_OF_SUBTOTAL" ? l.rate : null,
    prov: {
      ...(format.key !== DEFAULT_CLIENT_FORMAT.key && l.calc === "PERCENT_OF_SUBTOTAL" && l.rate !== null ? { rate: { origin: "TEMPLATE" as const, ref: { note: ref } } } : {}),
      ...(l.uom ? { uom: { origin: "TEMPLATE" as const, ref: { note: ref } } } : {}),
      ...(l.gstRate !== null ? { gstRate: { origin: "TEMPLATE" as const, ref: { note: ref } } } : {}),
    },
  }));
  // ids must be unique and stable
  const seen = new Set<string>();
  for (const l of lines) {
    while (seen.has(l.id)) l.id += "_";
    seen.add(l.id);
  }
  return {
    schemaVersion: 1,
    type: "CLIENT",
    style: { number: "TEMPLATE", label: "Client costing template" },
    currency: src.currency,
    lines,
    issues: [],
    client: {
      format,
      ...(src.client.pricing ? { pricing: src.client.pricing } : {}),
      // the vendor / brand block belongs to a named customer layout; the original layout carries no vendor data
      headerNotes: format.key !== DEFAULT_CLIENT_FORMAT.key ? src.client.headerNotes.filter(isLayoutNote) : [],
      category: null,
      sections: src.client.sections.map((s) => ({ key: s.key, label: s.label, phase: s.phase })),
      finance: { rate: 0, referenceRate: src.client.finance.referenceRate, note: "Applied factor is an input per style" },
      transport: { amount: 0 },
    },
  };
}
