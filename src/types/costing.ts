/**
 * Normalized costing schema.
 *
 * This is the single internal representation of both source workbooks. Nothing in
 * here knows about React, Prisma or Excel: parsers produce it, the calculation
 * engine consumes it, repositories store it as JSON snapshots.
 */

export type CostingType = "ACTUAL" | "CLIENT";

/** Where a number came from. */
export type Origin =
  | "IMPORT" // read from a source workbook
  | "CAD" // extracted from a CAD file
  | "MANUAL" // typed in by a user (new line / new value, no prior value)
  | "OVERRIDE" // typed over an existing value (the original is kept)
  | "DERIVED" // computed by the engine from other fields
  | "TEMPLATE" // copied from another costing used as template
  | "MASTER" // applied from a master / rule table
  | "DEFAULT"; // engine default

export interface SourceRef {
  file?: string;
  sheet?: string;
  /** A1 reference, e.g. "K2" or "E8" */
  cell?: string;
  /** Source column header, e.g. "Price without GST" */
  column?: string;
  /** Free text: "CAD → Style 72232 → Length per Set" */
  note?: string;
}

export interface OriginalValue {
  value: number | string | null;
  origin: Origin;
  ref?: SourceRef;
}

export interface Provenance {
  origin: Origin;
  ref?: SourceRef;
  /** Present when origin === "OVERRIDE": the value that was replaced. Never dropped. */
  original?: OriginalValue;
  reason?: string;
  at?: string;
  by?: string;
}

export type LineField =
  | "quantity"
  | "rate"
  | "uom"
  | "gstRate"
  | "description"
  | "amount"
  | "item";

/** How a line's total is calculated (taken from the source formula for that row). */
export type LineCalc =
  /** total = quantity × rate  (every line in the actual sheets, most client lines) */
  | "QTY_X_RATE"
  /** total = Total(main phase) × rate-as-fraction; quantity is NOT used (client Garment Rejection, Overhead+Margin) */
  | "PERCENT_OF_SUBTOTAL"
  /** total is a directly entered amount (actual LD CHARGES) */
  | "ENTERED_AMOUNT";

export interface CostLine {
  /** Stable id inside the document */
  id: string;
  /** Normalized section key. Actual: FABRIC_ORDER | CMT | TRIMS | LD_CHARGES | REJECT. Client: slug of the category */
  sectionKey: string;
  /** Section label exactly as in the source ("FABRIC ORDER", "Sewing trims") */
  sectionLabel: string;
  /** Cost item label exactly as in the source ("cotton slub", "Main Fabric") */
  item: string;
  description: string;
  /** Client "Item Type" (F / L / T / Cost) – source code, kept raw */
  itemType: string | null;
  quantity: number | null;
  uom: string | null;
  /** Actual: RATE. Client: Price without GST. For PERCENT_OF_SUBTOTAL lines: a fraction (0.08 = 8 %) */
  rate: number | null;
  /** Client GST as a fraction (0.12 = 12 %). Not used by actual costing. */
  gstRate: number | null;
  currency: string;
  calc: LineCalc;
  /** Only for ENTERED_AMOUNT */
  amount?: number | null;
  /** Client-only source columns: hsCode, duty, fabricType, fabricFinish, construction, knitGauge, cuttableWidth, source, costingScenario, action */
  attributes: Record<string, string | number | null>;
  /** Per-field provenance (absent = IMPORT of the whole row via sourceRef) */
  prov: Partial<Record<LineField, Provenance>>;
  /** Formula text found in the source for this row's total, e.g. "=C8*B8" */
  sourceFormula?: string;
  /** Row-level source reference (sheet + row) */
  sourceRef?: SourceRef;
  /** Added by a user, not present in the source structure */
  custom?: boolean;
  /** Imported line removed from this costing. Kept (never deleted) so source information is preserved; excluded from totals. */
  removed?: boolean;
}

export interface StyleIdentity {
  /** Style number as text (never coerced to number; "0556" stays "0556") */
  number: string;
  /** Title as written in the source ("78290 - off white", "GETKRTSCUT5008 - BLACK") */
  label: string;
  color?: string;
  productId?: string;
  designId?: string;
}

export interface DocSource {
  file: string;
  sheet: string;
  importedAt: string;
  importBatchId?: string;
}

export interface ImportIssue {
  level: "info" | "warning" | "error";
  code: string;
  message: string;
  ref?: SourceRef;
}

export interface QtyRate {
  qty: number | null;
  rate: number | null;
}

export interface ActualParams {
  orderPcs: QtyRate;
  dispatchPcs: QtyRate;
  /** B7 – consumption per piece (m). `formula` keeps e.g. "=1.93+0.24+1.26". */
  consumption: { value: number | null; formula?: string; prov?: Provenance };
  /** D4 – subtracted in the source Total Cost formula (blank everywhere → 0) */
  deduction: number;
  /** Source variant: two sheets compute profit % as E41*100/C2 + D50 */
  profitPctAddsValueLossPct: boolean;
  /** Free-text notes found in column G */
  notes: string[];
}

export interface ClientSectionDef {
  key: string;
  label: string;
  /** MAIN rows are summed into "Total" (L37). POST_TOTAL rows are added after it (Testing, Garment Rejection, Overhead+Margin). */
  phase: "MAIN" | "POST_TOTAL";
}

export interface ClientParams {
  /** Memo lines found in column A below Product ID */
  headerNotes: string[];
  /** Selected category from the Overhead + margin table (Core & Ultimate / Fashion / High Fashion) */
  category: string | null;
  sections: ClientSectionDef[];
  finance: {
    /** The factor actually multiplied in the source formula (L44 = L43 × factor). Source value: 0 */
    rate: number;
    /** Reference rate printed in the label ("FINANCE COST 3%") */
    referenceRate: number | null;
    prov?: Provenance;
    note?: string;
  };
  transport: { amount: number; prov?: Provenance };
}

export interface CostingBase {
  schemaVersion: 1;
  type: CostingType;
  style: StyleIdentity;
  currency: string;
  lines: CostLine[];
  source?: DocSource;
  issues: ImportIssue[];
  /** CAD values that were applied to this costing (kept for audit) */
  cadApplied?: CadAppliedSnapshot;
}

export interface ActualCosting extends CostingBase {
  type: "ACTUAL";
  actual: ActualParams;
}

export interface ClientCosting extends CostingBase {
  type: "CLIENT";
  client: ClientParams;
}

export type CostingDoc = ActualCosting | ClientCosting;

export interface CadAppliedSnapshot {
  styleNumber: string | null;
  lengthPerSet: number | null;
  width: number | null;
  appliedAt: string;
  mappings: Array<{ target: string; cadField: string; value: number; unit: string }>;
}

/* ───────────── calculation results ───────────── */

export interface SectionTotal {
  key: string;
  label: string;
  total: number;
  lineIds: string[];
}

export interface ActualResult {
  type: "ACTUAL";
  orderSale: number;
  dispatchSale: number;
  lineTotals: Record<string, number>;
  sections: SectionTotal[];
  totalFabricCost: number;
  cmtTotal: number;
  totalTrimsCost: number;
  ldCharges: number;
  deduction: number;
  totalCost: number;
  /** null when dispatch pcs is 0/blank (source would give #DIV/0!) */
  costPerPc: number | null;
  profit: number;
  perPcProfit: number | null;
  profitPct: number | null;
  rejection: SectionTotal;
  totalValueLoss: number;
  valueLossPct: number | null;
  /** CAD-implied fabric requirement (consumption × order pcs): reference only, never applied */
  impliedFabricRequirement: number | null;
}

export interface ClientLineResult {
  /** L – Base Total (W/o GST Factor) */
  base: number;
  /** O – Input Cost (GST amount) */
  gst: number;
  /** M – Base Total (With GST) */
  withGst: number;
}

export interface ClientResult {
  type: "CLIENT";
  lineResults: Record<string, ClientLineResult>;
  sections: Array<SectionTotal & { phase: "MAIN" | "POST_TOTAL"; gst: number; withGst: number }>;
  /** Row "Total" (L37/M37) */
  total: ClientLineResult;
  /** Total Cost (L41/M41/O41) */
  totalCost: ClientLineResult;
  fobPrice: number;
  financeCost: number;
  finalPoPrice: number;
  transport: number;
  finalPoPriceInclTransport: number;
}

export type CostingResult = ActualResult | ClientResult;

/* ───────────── CAD ───────────── */

export interface CadField<T = number> {
  value: T | null;
  unit?: string;
  raw?: string;
  /** 0..1 */
  confidence: number;
  /** true when the user must verify before relying on it */
  requiresVerification: boolean;
  notes: string[];
  /** set when the user edited the extracted value */
  manual?: { value: T | null; reason?: string };
}

export interface CadSizeEntry {
  size: string;
  qty: number;
}

export interface CadData {
  parserVersion: string;
  layout: string;
  pageCount: number;
  styleNumber: CadField<string>;
  sets: CadField<number>;
  sizeBreakdown: CadField<CadSizeEntry[]>;
  /** marker length, metres */
  length: CadField;
  /** marker width, inches */
  width: CadField;
  /** percent, e.g. 68.47 */
  efficiency: CadField;
  /** metres */
  lengthPerSet: CadField;
  /** as printed – see notes for the unit ambiguity */
  totalLength: CadField;
  totalPieces: CadField;
  surfacePiecesCount: CadField;
  date: CadField<string>;
  pieceNames: string[];
  /** every key/value pair found that is not one of the fields above */
  extra: Array<{ label: string; raw: string }>;
  warnings: string[];
  /** raw text lines of the header, for audit */
  rawLines: string[];
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  /** line id / field this issue refers to */
  lineId?: string;
  field?: string;
}
