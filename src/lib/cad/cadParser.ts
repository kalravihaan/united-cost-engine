import type { CadData, CadField, CadSizeEntry } from "@/types/costing";
import { extractPdfText, toLines, type PdfText, type TextItem } from "./pdfText";

export const CAD_PARSER_VERSION = "1.0.0";

/**
 * CAD extraction layer.
 *
 * Not coordinate based: the header text is split into (label → value) segments using a table of label
 * synonyms, so different CAD exporters (different order, separators, `Key: Value;` or `Key Value`
 * lines, other units) are handled by adding synonyms, not code. Each value gets a confidence and
 * cross-checks against the other values; anything doubtful is marked `requiresVerification`.
 */

type FieldKey =
  | "styleNumber"
  | "sets"
  | "length"
  | "width"
  | "efficiency"
  | "lengthPerSet"
  | "totalLength"
  | "totalPieces"
  | "surfacePiecesCount"
  | "date";

interface LabelDef {
  key: FieldKey;
  /** regex source (case-insensitive), must not contain capture groups that matter */
  re: string;
  /** canonical spelling – exact matches get higher confidence */
  canonical: string;
}

/** Extend here to support new CAD layouts. */
export const LABELS: LabelDef[] = [
  { key: "styleNumber", re: "style\\s*(?:name|no\\.?|number|code|#)?", canonical: "style name" },
  { key: "styleNumber", re: "article\\s*(?:no\\.?|number)?", canonical: "article" },
  { key: "lengthPerSet", re: "length\\s*(?:per|/)\\s*set", canonical: "length per set" },
  { key: "totalLength", re: "total\\s*length", canonical: "total length" },
  { key: "totalPieces", re: "total\\s*(?:pieces|piece|pcs|pc)", canonical: "total pieces" },
  { key: "surfacePiecesCount", re: "surface'?s?\\s*(?:pieces|piece|pcs)\\s*count", canonical: "surface's pieces count" },
  { key: "surfacePiecesCount", re: "pieces\\s*count", canonical: "pieces count" },
  { key: "length", re: "(?:marker\\s*)?length", canonical: "length" },
  { key: "width", re: "(?:fabric\\s*|marker\\s*)?width", canonical: "width" },
  { key: "efficiency", re: "eff(?:iciency)?\\.?", canonical: "efficiency" },
  { key: "sets", re: "sets?", canonical: "sets" },
  { key: "date", re: "date", canonical: "date" },
];

interface Segment {
  key: FieldKey | null;
  label: string;
  canonicalMatch: boolean;
  value: string;
  /** label without a known meaning (goes to `extra`) */
  unknownLabel?: string;
}

function findSegments(text: string): Segment[] {
  interface Hit {
    start: number;
    end: number;
    def: LabelDef;
    text: string;
  }
  const hits: Hit[] = [];
  for (const def of LABELS) {
    const re = new RegExp(`(?<![A-Za-z])(?:${def.re})(?![A-Za-z])`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) hits.push({ start: m.index, end: m.index + m[0].length, def, text: m[0] });
  }
  // resolve overlaps: earliest start wins; for the same start the longest wins
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Hit[] = [];
  for (const h of hits) {
    const last = kept[kept.length - 1];
    if (last && h.start < last.end) continue;
    kept.push(h);
  }
  const segs: Segment[] = [];
  for (let i = 0; i < kept.length; i++) {
    const h = kept[i];
    const next = kept[i + 1]?.start ?? text.length;
    let value = text.slice(h.end, next);
    // value ends at the first ';' (CAD exporters terminate pairs with ';')
    const semi = value.indexOf(";");
    if (semi >= 0) value = value.slice(0, semi);
    value = value.replace(/^[\s:=\-–]+/, "").trim();
    const norm = h.text.toLowerCase().replace(/\s+/g, " ");
    segs.push({ key: h.def.key, label: h.text, canonicalMatch: norm === h.def.canonical || norm === h.def.canonical.replace("'", "’"), value });
  }
  return segs;
}

/** key:value pairs terminated by ';' that did not match any known label → `extra` */
function unknownPairs(text: string, known: Segment[]): Array<{ label: string; raw: string }> {
  const out: Array<{ label: string; raw: string }> = [];
  for (const part of text.split(";")) {
    const m = part.match(/^\s*([A-Za-z][A-Za-z '’.\/-]{1,40}?)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const label = m[1].trim();
    if (known.some((s) => part.toLowerCase().includes(s.label.toLowerCase()))) continue;
    out.push({ label, raw: m[2] });
  }
  return out;
}

function mkField<T>(value: T | null, o: Partial<CadField<T>> = {}): CadField<T> {
  return {
    value,
    unit: o.unit,
    raw: o.raw,
    confidence: o.confidence ?? (value === null ? 0 : 0.5),
    requiresVerification: o.requiresVerification ?? value === null,
    notes: o.notes ?? [],
  };
}

/* ───────────── value parsers ───────────── */

const NUM = "(-?\\d+(?:[.,]\\d+)?)";

function parseNumber(s: string): number | null {
  const m = s.match(new RegExp(NUM));
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

type LengthUnit = "m" | "cm" | "mm" | "yd" | "in" | null;

function parseLength(s: string): { value: number; unit: LengthUnit } | null {
  const m = s.match(new RegExp(`${NUM}\\s*(mtrs?|meters?|metres?|m|cm|mm|yards?|yds?|inch(?:es)?|in|")?(?![A-Za-z])`, "i"));
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  const u = (m[2] ?? "").toLowerCase();
  let unit: LengthUnit = null;
  if (/^(m|mtrs?|meters?|metres?)$/.test(u)) unit = "m";
  else if (u === "cm") unit = "cm";
  else if (u === "mm") unit = "mm";
  else if (/^(yards?|yds?)$/.test(u)) unit = "yd";
  else if (/^(inch(es)?|in|")$/.test(u)) unit = "in";
  return Number.isFinite(value) ? { value, unit } : null;
}

const toMetres = (v: number, u: LengthUnit): number => (u === "cm" ? v / 100 : u === "mm" ? v / 1000 : u === "yd" ? v * 0.9144 : u === "in" ? v * 0.0254 : v);
const toInches = (v: number, u: LengthUnit): number => (u === "cm" ? v / 2.54 : u === "mm" ? v / 25.4 : u === "m" ? v / 0.0254 : u === "yd" ? v * 36 : v);

const round = (v: number, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

/* ───────────── main ───────────── */

export async function parseCadPdf(data: Uint8Array | Buffer): Promise<CadData> {
  const pdf = await extractPdfText(data);
  return parseCadText(pdf);
}

export function parseCadText(pdf: PdfText): CadData {
  const warnings: string[] = [];
  const allItems = pdf.pages.flatMap((p) => p.items);
  if (allItems.filter((i) => i.str.trim()).length === 0) {
    warnings.push("The PDF has no text layer (scanned/raster). Values cannot be extracted – enter them manually.");
  }

  // Header = horizontal text lines of the first page (CAD exporters print the summary on page 1)
  const lines = toLines(pdf.pages[0]?.items ?? []);
  // The summary block is the run of lines containing "label:value" pairs – drawing annotations are rotated and excluded.
  const header = lines.join(" ; ").replace(/\s*;\s*;\s*/g, " ; ");
  const segs = findSegments(header);

  const take = (key: FieldKey): Segment[] => segs.filter((s) => s.key === key && s.value !== "");
  const first = (key: FieldKey): Segment | undefined => take(key)[0];
  const multi = (key: FieldKey) => take(key).length > 1;

  const baseConfidence = (s: Segment) => (s.canonicalMatch ? 0.95 : 0.85);

  /* style */
  const styleSeg = first("styleNumber");
  let styleNumber = mkField<string>(null);
  if (styleSeg) {
    const m = styleSeg.value.match(/^#?\s*([A-Za-z0-9][A-Za-z0-9\-_/.]*)/);
    if (m) styleNumber = mkField(m[1], { raw: `${styleSeg.label}: ${styleSeg.value}`, confidence: baseConfidence(styleSeg), requiresVerification: false });
  }

  /* sets + size breakdown */
  const setsSeg = first("sets");
  let sets = mkField<number>(null);
  let sizeBreakdown = mkField<CadSizeEntry[]>([] as CadSizeEntry[]);
  sizeBreakdown = { ...sizeBreakdown, value: null };
  if (setsSeg) {
    const m = setsSeg.value.match(/^(\d+)\s*(?:,\s*(.*))?$/);
    if (m) {
      sets = mkField(Number(m[1]), { raw: setsSeg.value, confidence: baseConfidence(setsSeg), requiresVerification: false });
      if (m[2]) {
        const entries: CadSizeEntry[] = [];
        for (const part of m[2].split(",")) {
          const e = part.trim().match(/^([A-Za-z0-9]+)\s*\/\s*(\d+)$/);
          if (e) entries.push({ size: e[1].toUpperCase(), qty: Number(e[2]) });
        }
        if (entries.length) {
          const total = entries.reduce((a, b) => a + b.qty, 0);
          const ok = total === sets.value;
          sizeBreakdown = mkField(entries, {
            raw: m[2],
            confidence: ok ? 0.95 : 0.6,
            requiresVerification: !ok,
            notes: ok ? [] : [`Size quantities add to ${total} but Sets = ${sets.value}.`],
          });
        }
      }
    }
  }

  /* lengths */
  const lenField = (key: FieldKey, target: "m" | "in"): CadField => {
    const seg = first(key);
    if (!seg) return mkField<number>(null);
    const p = parseLength(seg.value);
    if (!p) return mkField<number>(null, { raw: seg.value, notes: ["Could not read a number from the value."] });
    const notes: string[] = [];
    let confidence = baseConfidence(seg);
    if (p.unit === null) {
      confidence = Math.min(confidence, 0.6);
      notes.push(`No unit printed; assumed ${target === "m" ? "metres" : "inches"}.`);
    }
    const value = target === "m" ? round(toMetres(p.value, p.unit)) : round(toInches(p.value, p.unit));
    if (p.unit && ((target === "m" && p.unit !== "m") || (target === "in" && p.unit !== "in"))) notes.push(`Converted from ${p.value} ${p.unit}.`);
    return mkField(value, { unit: target === "m" ? "m" : "inch", raw: `${seg.label}: ${seg.value}`, confidence, requiresVerification: p.unit === null, notes });
  };
  const length = lenField("length", "m");
  const width = lenField("width", "in");
  let lengthPerSet = lenField("lengthPerSet", "m");
  let totalLength = lenField("totalLength", "m");

  /* efficiency */
  const effSeg = first("efficiency");
  let efficiency = mkField<number>(null);
  if (effSeg) {
    const v = parseNumber(effSeg.value);
    if (v !== null) {
      const hasPct = /%/.test(effSeg.value);
      const inRange = v > 0 && v <= 100;
      efficiency = mkField(v, {
        unit: "%",
        raw: `${effSeg.label}: ${effSeg.value}`,
        confidence: inRange ? (hasPct ? baseConfidence(effSeg) : 0.7) : 0.3,
        requiresVerification: !inRange || !hasPct,
        notes: [...(!hasPct ? ["No % sign printed."] : []), ...(!inRange ? ["Efficiency outside 0–100 %."] : [])],
      });
    }
  }

  /* counts */
  const countField = (key: FieldKey): CadField => {
    const seg = first(key);
    if (!seg) return mkField<number>(null);
    const v = parseNumber(seg.value);
    if (v === null) return mkField<number>(null, { raw: seg.value });
    return mkField(v, { raw: `${seg.label}: ${seg.value}`, confidence: baseConfidence(seg), requiresVerification: !Number.isInteger(v) });
  };
  const totalPieces = countField("totalPieces");
  const surfacePiecesCount = countField("surfacePiecesCount");

  /* date */
  const dateSeg = first("date");
  let date = mkField<string>(null);
  if (dateSeg) {
    const m = dateSeg.value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (m) {
      const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      date = mkField(iso, { raw: dateSeg.value, confidence: 0.9, requiresVerification: false });
    }
  }

  /* ───────── cross-checks (never silently resolved) ───────── */

  for (const k of ["length", "width", "efficiency", "lengthPerSet", "totalLength", "totalPieces", "styleNumber", "sets"] as FieldKey[]) {
    if (multi(k)) warnings.push(`"${k}" appears more than once in the CAD header; the first occurrence was used. Verify.`);
  }

  // lengthPerSet vs length / sets
  if (length.value !== null && sets.value && sets.value > 0) {
    const expected = length.value / sets.value;
    if (lengthPerSet.value === null) {
      lengthPerSet = mkField(round(expected), {
        unit: "m",
        raw: `derived: Length ÷ Sets = ${length.value} ÷ ${sets.value}`,
        confidence: 0.55,
        requiresVerification: true,
        notes: ["Not printed in the CAD; derived from Length ÷ Sets. Verify before use."],
      });
    } else {
      const tol = 0.006 + 0.005 * expected;
      if (Math.abs(expected - lengthPerSet.value) <= tol) {
        lengthPerSet.confidence = Math.max(lengthPerSet.confidence, 0.97);
        lengthPerSet.notes.push(`Consistent with Length ÷ Sets = ${expected.toFixed(3)} m.`);
      } else {
        lengthPerSet.confidence = Math.min(lengthPerSet.confidence, 0.5);
        lengthPerSet.requiresVerification = true;
        lengthPerSet.notes.push(`Does not match Length ÷ Sets = ${expected.toFixed(3)} m.`);
        warnings.push(`Length per Set (${lengthPerSet.value} m) differs from Length ÷ Sets (${expected.toFixed(3)} m).`);
      }
    }
  }

  // total pieces vs surface pieces count
  if (totalPieces.value !== null && surfacePiecesCount.value !== null) {
    if (totalPieces.value === surfacePiecesCount.value) {
      totalPieces.notes.push("Equals Surface's Pieces Count.");
    } else {
      totalPieces.requiresVerification = surfacePiecesCount.requiresVerification = true;
      totalPieces.confidence = Math.min(totalPieces.confidence, 0.5);
      warnings.push(`Total pieces (${totalPieces.value}) differs from Surface's Pieces Count (${surfacePiecesCount.value}).`);
    }
  }

  // total length plausibility: 152.54 "m" for a 3.87 m marker is 39.4 × the marker, i.e. ≈ the marker in inches
  if (totalLength.value !== null && length.value !== null && length.value > 0) {
    const ratio = totalLength.value / length.value;
    const inchesPerMetre = 39.3701;
    if (Math.abs(ratio - inchesPerMetre) <= 1.2) {
      totalLength.confidence = Math.min(totalLength.confidence, 0.4);
      totalLength.requiresVerification = true;
      totalLength.notes.push(
        `Printed as ${totalLength.value} m, but that is ${ratio.toFixed(1)}× the marker length (≈ ${inchesPerMetre} in/m). It numerically equals the marker length in INCHES (${length.value} m = ${(length.value * inchesPerMetre).toFixed(2)} in). The unit may be mislabelled – verify.`,
      );
      warnings.push(`Total Length ${totalLength.value} m is ≈ the ${length.value} m marker expressed in inches – unit ambiguous, not used automatically.`);
    } else if (Math.abs(ratio - 1) < 0.02) {
      totalLength.notes.push("Equals marker length.");
    } else if (sets.value && Math.abs(ratio - sets.value) < 0.05 * sets.value) {
      totalLength.notes.push("≈ Length × Sets.");
    } else {
      totalLength.confidence = Math.min(totalLength.confidence, 0.5);
      totalLength.requiresVerification = true;
      totalLength.notes.push(`Not obviously related to Length (${length.value} m) or Sets – verify.`);
    }
  }

  /* drawing annotations: piece names, size tags, style tags */
  const { pieceNames, sizeTags, styleTags } = readDrawing(allItems);
  if (styleNumber.value) {
    const foreign = styleTags.filter((t) => t.toUpperCase() !== styleNumber.value!.toUpperCase());
    if (foreign.length) {
      styleNumber.requiresVerification = true;
      styleNumber.confidence = Math.min(styleNumber.confidence, 0.6);
      warnings.push(`The drawing carries style tag(s) ${[...new Set(foreign)].map((t) => "#" + t).join(", ")} different from the header (${styleNumber.value}).`);
    } else if (styleTags.length) {
      styleNumber.notes.push(`Confirmed by ${styleTags.length} style tag(s) in the drawing.`);
      styleNumber.confidence = Math.max(styleNumber.confidence, 0.98);
    }
  } else if (styleTags.length === 1) {
    styleNumber = mkField(styleTags[0], { confidence: 0.5, requiresVerification: true, notes: ["Taken from a drawing tag; no header 'Style' label found."], raw: "#" + styleTags[0] });
  }
  if (sizeBreakdown.value && sizeTags.length) {
    const declared = new Set(sizeBreakdown.value.map((s) => s.size));
    const missing = [...declared].filter((s) => !sizeTags.includes(s));
    if (missing.length) sizeBreakdown.notes.push(`Sizes ${missing.join(", ")} are in the header but not tagged on the drawing.`);
    else sizeBreakdown.notes.push("All sizes are tagged on the drawing.");
  }
  if (pieceNames.length) {
    warnings.push(`Marker contains only: ${pieceNames.join(", ")}. If the garment has other panels, this is not full-garment consumption – verify.`);
  }

  const known = segs.filter((s) => s.key);
  const extra = unknownPairs(header, known);

  return {
    parserVersion: CAD_PARSER_VERSION,
    layout: segs.length ? "labelled-header" : "unknown",
    pageCount: pdf.pageCount,
    styleNumber,
    sets,
    sizeBreakdown,
    length,
    width,
    efficiency,
    lengthPerSet,
    totalLength,
    totalPieces,
    surfacePiecesCount,
    date,
    pieceNames,
    extra,
    warnings,
    rawLines: lines.slice(0, 20),
  };
}

const SIZE_RE = /^(?:XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|\d{2})$/i;

function readDrawing(items: TextItem[]): { pieceNames: string[]; sizeTags: string[]; styleTags: string[] } {
  const rotated = items.filter((i) => i.rotated);
  // runs of consecutive rotated items form one label
  const runs: string[][] = [];
  let cur: string[] = [];
  let lastOrder = -2;
  let prev: TextItem | null = null;
  for (const it of rotated) {
    // a label = consecutive stream items whose anchors are close together; a jump starts the next label
    const jump = prev ? Math.hypot(it.x - prev.x, it.y - prev.y) > 120 : false;
    if ((it.order !== lastOrder + 1 || jump) && cur.length) {
      runs.push(cur);
      cur = [];
    }
    cur.push(it.str);
    lastOrder = it.order;
    prev = it;
  }
  if (cur.length) runs.push(cur);

  const sizeTags = new Set<string>();
  const styleTags: string[] = [];
  const names = new Map<string, number>();
  for (const run of runs) {
    const rest: string[] = [];
    for (const raw of run) {
      const t = raw.trim();
      if (!t) continue;
      const st = t.match(/^#([A-Za-z0-9][A-Za-z0-9\-_/.]*)$/);
      if (st) {
        styleTags.push(st[1]);
        continue;
      }
      if (SIZE_RE.test(t)) {
        sizeTags.add(t.toUpperCase());
        continue;
      }
      rest.push(t);
    }
    let name = rest.join(" ").replace(/\s+/g, " ").trim();
    // two neighbouring labels can fall in one run: "X X" → "X"
    const rep = name.match(/^(.+?)(?:\s+\1)+$/);
    if (rep) name = rep[1];
    if (name.length >= 4) names.set(name, (names.get(name) ?? 0) + 1);
  }
  const pieceNames = [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return { pieceNames, sizeTags: [...sizeTags], styleTags };
}
