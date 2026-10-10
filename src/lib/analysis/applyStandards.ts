import type { ActualCosting } from "@/types/costing";
import { setLineField } from "@/lib/calculations/overrides";
import { segmentFor } from "./benchmarks";
import { STANDARD_SOURCE } from "./standardRates";

/** A Rate master row, as listed by Masters → Rate Masters. */
export interface MasterRate {
  costingType: string;
  sectionKey: string;
  itemName: string;
  rate: number;
  uom?: string | null;
  source?: string | null;
}

export interface StandardChange {
  lineId: string;
  item: string;
  sectionKey: string;
  /** rate now in the costing (null = blank) */
  from: number | null;
  to: number;
  /** the master row the rate comes from */
  master: string;
  source: string;
  /** the line already has a rate: only applied when the user ticks it */
  overwrites: boolean;
  /** standard rests on fewer than 3 sheets / lines */
  indicative: boolean;
  /** the row has a quantity: only then does a rate change the cost */
  hasQuantity: boolean;
}

export interface StandardPlan {
  segment: string;
  cluster: string;
  family: string;
  changes: StandardChange[];
  /** lines of the costing that have no standard (kept as they are) */
  noStandard: string[];
  /** lines whose rate a person typed or overrode: never replaced by a standard */
  keptTyped: string[];
  /** rows that already carry exactly the standard rate */
  alreadyAtStandard: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/frieght/g, "freight").replace(/\s+/g, " ").trim();

/** Free-text add-on rows of FABRIC ORDER → the embellishment kind of the rate master (first match wins). */
const ADDON_KINDS: Array<[RegExp, string]> = [
  [/tassel/, "Tassels"],
  [/lace|dori/, "Lace / dori"],
  [/neck.*(&|and).*sleeve|sleeve.*(&|and).*neck/, "Neck & sleeve emb"],
  [/yoke/, "Yoke emb"],
  [/palla/, "Palla emb"],
  [/front/, "Front emb"],
  [/katha/, "Katha work"],
  [/couching/, "Couching emb"],
  [/scallop/, "Scallop"],
  [/hand ?work/, "Hand work"],
  [/sleeve|slv/, "Sleeve emb"],
  [/neck/, "Neck emb"],
  [/zipper/, "Zipper"],
  [/elastic/, "Elastic"],
  [/button/, "Button"],
  [/^emb( mtr)?$/, "Embroidery (unspecified)"],
];

const sampleOf = (source: string): number | null => {
  const m = source.match(/median of (\d+)/);
  return m ? Number(m[1]) : null;
};

/**
 * Which standard rate each line of an Actual costing would take, from the Rate masters (so edits made to the masters flow through).
 * Only lines of the costing that name something with a master rate are touched: CMT rows, trims, and the embellishment / lace / tassel add-ons.
 * Fabric rows are never matched: the standard fabric figure is a landed rate (purchase + finishing), which would double-count the finishing row.
 * Quantities are never touched, and a rate a person typed (or overrode) is never replaced.
 */
export function planStandardRates(doc: ActualCosting, masters: MasterRate[], ctx: { styleNumber: string; clientFormat?: string | null; brand?: string | null }): StandardPlan {
  const segment = segmentFor(ctx.styleNumber, ctx.clientFormat, ctx.brand);
  const family = segment === "YOUSTA" ? "YOUSTA" : "Live Smart";
  const cons = doc.actual.consumption.value;
  const cluster = cons !== null && cons >= 2.2 ? "Set / long (≥2.2 m)" : "Kurta / top";

  const actual = masters.filter((m) => m.costingType === "ACTUAL" && Number.isFinite(m.rate) && m.rate > 0);
  const own = (section: string, name: string) => actual.find((m) => m.sectionKey === section && norm(m.itemName) === norm(name) && !(m.source ?? "").startsWith(STANDARD_SOURCE));
  const std = (section: string, name: string) => actual.find((m) => m.sectionKey === section && norm(m.itemName) === norm(name));

  const changes: StandardChange[] = [];
  const noStandard: string[] = [];
  const keptTyped: string[] = [];
  const alreadyAtStandard: string[] = [];
  for (const l of doc.lines) {
    if (l.removed || l.calc !== "QTY_X_RATE") continue;
    if (l.sectionKey !== "CMT" && l.sectionKey !== "TRIMS" && l.sectionKey !== "FABRIC_ORDER") continue;
    const item = norm(l.item);
    let m: MasterRate | undefined;
    if (l.sectionKey === "CMT") {
      if (!/^cmt( kurta)?$/.test(item)) continue; // CMT BOTTOM and others: no standard
      m = own("CMT", l.item) ?? std("CMT", `CMT · ${segment} · ${cluster}`);
    } else if (l.sectionKey === "TRIMS") {
      m = own("TRIMS", l.item) ?? std("TRIMS", `${item} (${family})`);
    } else {
      if (/^fabric( \d| finishing)/.test(item)) continue; // fabric: see the doc comment
      m = own("FABRIC_ORDER", l.item);
      const kind = ADDON_KINDS.find(([re]) => re.test(item))?.[1];
      if (!m && kind) m = std("FABRIC_ORDER", kind);
    }
    if (!m) {
      if (l.sectionKey !== "FABRIC_ORDER" || ADDON_KINDS.some(([re]) => re.test(item))) noStandard.push(l.item);
      continue;
    }
    const from = l.rate ?? null;
    if (from !== null && Math.abs(from - m.rate) < 1e-9) {
      alreadyAtStandard.push(l.item);
      continue;
    }
    if (from !== null && from !== 0 && (l.prov.rate?.origin === "MANUAL" || l.prov.rate?.origin === "OVERRIDE")) {
      keptTyped.push(l.item); // a person's number: the standard never replaces it
      continue;
    }
    const source = m.source ?? "Rate master";
    const k = sampleOf(source);
    changes.push({ lineId: l.id, item: l.item, sectionKey: l.sectionKey, from, to: m.rate, master: m.itemName, source, overwrites: from !== null && from !== 0, indicative: k !== null && k < 3, hasQuantity: (l.quantity ?? 0) > 0 });
  }
  return { segment, cluster, family, changes: changes.sort((a, b) => Number(b.hasQuantity) - Number(a.hasQuantity)), noStandard, keptTyped, alreadyAtStandard };
}

/** Write the chosen rates into the costing. Origin MASTER, the rate it replaces is kept as the line's original (restorable); quantities untouched. */
export function applyStandardRates(doc: ActualCosting, chosen: StandardChange[], opts: { by?: string; now?: () => Date } = {}): ActualCosting {
  let out = doc;
  for (const c of chosen) {
    // a rate without field provenance is the imported row's own: record that, so the replaced value is kept as the original
    const line = out.lines.find((l) => l.id === c.lineId);
    if (line && line.rate !== null && line.rate !== 0 && !line.prov.rate) {
      out = { ...out, lines: out.lines.map((l) => (l.id === c.lineId ? { ...l, prov: { ...l.prov, rate: { origin: "IMPORT" as const, ref: l.sourceRef } } } : l)) };
    }
    out = setLineField(out, c.lineId, "rate", c.to, { by: opts.by, now: opts.now }, "MASTER", { note: `${c.master} · ${c.source}` });
  }
  return out;
}

