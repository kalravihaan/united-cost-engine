/** Pure text normalization helpers shared by parsers, matching and validation. */

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function collapse(s: string): string {
  return s.replace(/[ \s]+/g, " ").trim();
}

export interface StyleTitle {
  /** raw head token(s) before the first dash / space, e.g. "78290" or "GETKRTSCUT5008" */
  head: string;
  /** everything after the separator, e.g. "off white" */
  color: string;
  label: string;
}

/**
 * "78290 - off white" → head 78290 / color "off white"
 * "65440- lilac", "72145-off white", "2386 fuchsia", "GETKRTSCUT5008 - BLACK"
 */
export function splitStyleTitle(title: string): StyleTitle {
  const label = collapse(title);
  const dash = label.match(/^(.*?)\s*-\s*(.*)$/);
  if (dash && dash[1]) return { head: dash[1].trim(), color: dash[2].trim(), label };
  const sp = label.match(/^(\S+)\s+(.*)$/);
  if (sp) return { head: sp[1], color: sp[2].trim(), label };
  return { head: label, color: "", label };
}

/** Canonical comparison key for style numbers: upper-case alnum only, leading '#' dropped. */
export function styleKey(s: string): string {
  return s.replace(/^#/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function toFraction(pct: number | null | undefined): number | null {
  if (pct === null || pct === undefined) return null;
  return pct / 100;
}

/* ───────────── UOM ───────────── */

export type UomDimension = "length_m" | "length_in" | "length_yd" | "mass" | "count" | "unknown";

const UOM_DIMENSION: Record<string, UomDimension> = {
  m: "length_m",
  mtr: "length_m",
  mtrs: "length_m",
  meter: "length_m",
  metre: "length_m",
  meters: "length_m",
  metres: "length_m",
  in: "length_in",
  inch: "length_in",
  inches: "length_in",
  '"': "length_in",
  yd: "length_yd",
  yds: "length_yd",
  yard: "length_yd",
  kg: "mass",
  kgs: "mass",
  pcs: "count",
  pc: "count",
  piece: "count",
  pieces: "count",
  set: "count",
};

/** Dimension of a UOM string, used only to check compatibility (e.g. mtr vs m). Never to rename source values. */
export function uomDimension(uom: string | null | undefined): UomDimension {
  if (!uom) return "unknown";
  return UOM_DIMENSION[uom.trim().toLowerCase()] ?? "unknown";
}
