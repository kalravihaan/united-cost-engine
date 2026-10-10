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

/**
 * Free-text rows of the actual sheets are spelled differently from style to style ("tassal", "tassels", "tassel with coin";
 * "emb neck mtr", "gadhwal emb neck mtr"; "frieght"). The template keeps ONE row per kind of cost.
 */
const ROW_ALIASES: Array<[RegExp, string]> = [
  [/fr[ie]+ght/i, "freight"],
  [/tass?[ae]ls?.*coin/i, "tassels with coin"],
  [/tass?[ae]ls?.*dori/i, "tassels with dori"],
  [/^tass?[ae]ls?$/i, "tassels"],
  [/emb.*yoke|yoke.*emb/i, "emb yoke + sleeve"],
  [/emb.*neck.*(&|and|\+).*sle|neck.*sle.*emb/i, "emb neck & sleeve"],
  [/emb.*neck|neck.*emb/i, "emb neck"],
  [/emb.*sle|sle.*emb/i, "emb sleeve"],
  [/front.*emb|emb.*front/i, "emb front"],
  [/palla/i, "emb palla"],
  [/katha/i, "emb katha work"],
  [/couching/i, "couching emb"],
  [/foil/i, "foil print"],
  [/lace.*neck/i, "lace neck"],
  [/lace.*sle/i, "lace sleeve"],
  [/^emb\b.*mtr$|^emb mtr$/i, "emb mtr"],
];
/** Fabric purchase rows are named after the fabric ("40x30s COTTON Greige"); their processing rows after the process. One generic row covers them. */
const PROCESSING = /finish|print(ed|ing)\b.*\b(fabric|cotton|pst|poly)|\b(fabric|cotton|pst|poly)\b.*print(ed|ing)/i;
export const canonicalRow = (label: string): string => {
  const l = collapse(label);
  for (const [re, name] of ROW_ALIASES) if (re.test(l)) return name;
  return l;
};

/** Union of labels (after aliasing), case-insensitive, most frequent spelling wins, ordered by (first row position, frequency). */
function unionLabels(rows: Array<Array<{ label: string; pos: number }>>, canon: (l: string) => string = collapse): string[] {
  const acc = new Map<string, { spell: Map<string, number>; pos: number; n: number }>();
  for (const r of rows)
    for (const { label, pos } of r) {
      const c = canon(label);
      const key = c.toLowerCase();
      if (!key) continue;
      const e = acc.get(key) ?? { spell: new Map(), pos, n: 0 };
      e.spell.set(c, (e.spell.get(c) ?? 0) + 1);
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

export function buildActualTemplate(input: ParsedActualWorkbook | ParsedActualWorkbook[], fileName?: string): ActualCosting {
  // several reference workbooks can be learnt together: the template is the union of every row seen
  const books = Array.isArray(input) ? input : [input];
  const parsed = { fileName: books.map((b) => b.fileName).join(" + "), sheets: books.flatMap((b) => b.sheets), issues: [] as never[] } as ParsedActualWorkbook;
  fileName ??= parsed.fileName;
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
  // processing of the fabric (finishing / printing) is bought separately in many sheets
  if (parsed.sheets.some((s) => s.doc.lines.some((l) => l.sectionKey === "FABRIC_ORDER" && PROCESSING.test(l.item)))) add("FABRIC_ORDER", "FABRIC ORDER", "Fabric finishing / printing");
  for (const label of unionLabels(addOns, canonicalRow)) add("FABRIC_ORDER", "FABRIC ORDER", label);

  const lab = (key: string) => parsed.sheets.map((s) => s.doc.lines.filter((l) => l.sectionKey === key).map((l, i) => ({ label: l.item, pos: i })));
  for (const label of unionLabels(lab("CMT"))) add("CMT", "CMT", label);
  for (const label of unionLabels(lab("TRIMS"), canonicalRow)) add("TRIMS", "TRIMS", label);
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

export const DEFAULT_CLIENT_FORMAT: ClientFormat = { key: "DEFAULT", label: "Live Smart (GET layout)" };

/** Vendor / brand memo lines are part of a customer's layout; per-style measurement notes ("L - 44\"") are not. */
const isLayoutNote = (n: string) => /^(brand|vendor)\b/i.test(n) || /^[A-Z0-9 .&/-]{6,}$/.test(n) && !/^(XXL|XL|L|M|S|BO?)\s*[-–]/i.test(n);

/**
 * `format` names the customer layout the reference sheet follows (default: the original GET layout). A non-default
 * format also keeps the fixed percentages of its post-total rows (Garment Rejection, Overhead+Margin) as TEMPLATE defaults.
 */
export function buildClientTemplate(sheet: ParsedClientSheet, fileName = sheet.doc.source?.file ?? "client costing.xlsx", format: ClientFormat = DEFAULT_CLIENT_FORMAT, extras: ParsedClientSheet[] = []): ClientCosting {
  const ref = `Reference: ${fileName}`;
  const base = sheet.doc;
  // further sheets of the same layout add the rows / headers / price rows the first one lacks (e.g. a newer sheet with an MSME price)
  const srcLines = [...base.lines];
  const srcSections = [...base.client.sections];
  const rowKey = (l: CostLine) => `${l.sectionKey}|${collapse(l.item).toLowerCase()}`;
  for (const x of extras) {
    for (const sec of x.doc.client.sections) if (!srcSections.some((y) => y.key === sec.key)) srcSections.push(sec);
    for (const l of x.doc.lines) {
      if (!l.item.trim() || srcLines.some((y) => rowKey(y) === rowKey(l))) continue;
      const lastOfSection = srcLines.map((y, i) => (y.sectionKey === l.sectionKey ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      srcLines.splice(lastOfSection + 1 || srcLines.length, 0, l);
    }
  }
  const tiers = [sheet, ...extras].some((x) => x.overheadTiers.length > 0);
  const src = { ...base, lines: srcLines, client: { ...base.client, sections: srcSections, pricing: [base, ...extras.map((x) => x.doc)].reduce<ClientCosting["client"]["pricing"]>((acc, d) => (d.client.pricing ? { ...(acc ?? d.client.pricing), ...(d.client.pricing.msme ? { msme: d.client.pricing.msme } : {}) } : acc), undefined) } };
  // a named customer layout keeps the wording / sheet name / upload sheet of the customer's own workbook for its Excel output
  if (format.key !== DEFAULT_CLIENT_FORMAT.key) format = { ...format, export: { sheetName: src.source?.sheet, headers: sheet.headerLabels, updateSheet: !!sheet.updateSheet } };
  // stray unnamed value rows of a customer sheet (no item, no description) are not structure
  const keepFixed = (l: CostLine) => format.key !== DEFAULT_CLIENT_FORMAT.key && l.calc === "PERCENT_OF_SUBTOTAL" && !(tiers && l.sectionKey === "overhead_margin");
  const lines: CostLine[] = src.lines.filter((l) => l.item || l.description || l.calc !== "QTY_X_RATE").map((l, i) => ({
    ...blankLine({ sectionKey: l.sectionKey, sectionLabel: l.sectionLabel, item: l.item, calc: l.calc }, `${l.sectionKey}:${slug(l.item || l.description || String(i))}${i}`, ref),
    itemType: l.itemType,
    uom: l.uom,
    gstRate: l.gstRate,
    currency: l.currency,
    description: "",
    // structural percentages (Garment Rejection / Overhead+Margin) are entered per style; category sets Overhead+Margin.
    // A named customer layout has fixed percentages: kept as visible TEMPLATE defaults.
    // (the Overhead+Margin rate is set by the style's category when the layout has a category table)
    rate: keepFixed(l) ? l.rate : null,
    prov: {
      ...(keepFixed(l) && l.rate !== null ? { rate: { origin: "TEMPLATE" as const, ref: { note: ref } } } : {}),
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
