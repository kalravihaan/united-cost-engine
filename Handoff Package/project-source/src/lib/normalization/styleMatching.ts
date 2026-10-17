import { splitStyleTitle, styleKey } from "./labels";

/**
 * Style matching. Sources name the same style differently:
 *   entered "72232"  ·  actual sheet "0556 - lt blue"  ·  client Product ID "GETKRTSCUT5008 - BLACK"  ·  CAD "#72232"
 * The matcher returns a confidence and a human-readable reason. Only an unambiguous exact normalized
 * match is "EXACT" (safe to select without asking). Everything else is "POSSIBLE" and must be confirmed
 * by the user; confirmed pairs are stored as aliases (see StyleAlias) and then match exactly.
 */

export interface StyleCandidate {
  id: string;
  number: string;
  /** other known names: source titles, product ids, confirmed aliases */
  names?: string[];
  /** aliases the user has explicitly confirmed (match with confidence 1) */
  confirmedAliases?: string[];
}

export interface StyleMatch {
  candidate: StyleCandidate;
  confidence: number;
  reason: string;
}

export interface StyleMatchResult {
  status: "EXACT" | "POSSIBLE" | "NONE";
  query: string;
  best: StyleMatch | null;
  others: StyleMatch[];
  message: string;
}

function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = dp[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
      rowMin = Math.min(rowMin, dp[j]);
    }
    if (rowMin > max) return max + 1;
  }
  return dp[b.length];
}

const stripZeros = (k: string) => k.replace(/^0+(?=\d)/, "");

/** alpha prefix + numeric core: GETKRTSCUT5008 → {prefix:'GETKRTSCUT', num:'5008'} */
function parts(key: string): { prefix: string; num: string | null } {
  const m = key.match(/^([A-Z]*)(\d+)$/);
  return m ? { prefix: m[1], num: m[2] } : { prefix: key, num: null };
}

function scoreOne(qKey: string, candKey: string, via: string): { confidence: number; reason: string } | null {
  if (!qKey || !candKey) return null;
  if (qKey === candKey) return { confidence: 1, reason: `Exact match with ${via}` };
  const q = parts(qKey);
  const c = parts(candKey);
  if (q.num && c.num && stripZeros(q.num) === stripZeros(c.num)) {
    if (q.prefix === c.prefix) return { confidence: 0.9, reason: `Same style number apart from leading zeros (${via})` };
    if (!q.prefix || !c.prefix) return { confidence: 0.8, reason: `Same numeric core "${stripZeros(q.num)}" but different code prefix (${via})` };
    return { confidence: 0.55, reason: `Same numeric core but different prefixes "${q.prefix}" / "${c.prefix}" (${via})` };
  }
  if (qKey.length >= 4 && candKey.length >= 4 && (candKey.includes(qKey) || qKey.includes(candKey))) {
    return { confidence: 0.6, reason: `One style code contains the other (${via})` };
  }
  if (qKey.length >= 4 && candKey.length >= 4 && levenshtein(qKey, candKey, 1) <= 1) {
    return { confidence: 0.5, reason: `Differs by a single character (${via}) – may be a typo` };
  }
  return null;
}

export function matchStyle(query: string, candidates: StyleCandidate[]): StyleMatchResult {
  const q = query.trim();
  const qKey = styleKey(q);
  if (!qKey) return { status: "NONE", query: q, best: null, others: [], message: "Enter a style number." };

  // a query like "78290 - off white" is compared by its head token too
  const qHeadKey = styleKey(splitStyleTitle(q).head);
  const matches: StyleMatch[] = [];
  for (const cand of candidates) {
    let best: { confidence: number; reason: string } | null = null;
    const consider = (r: { confidence: number; reason: string } | null) => {
      if (r && (!best || r.confidence > best.confidence)) best = r;
    };
    consider(scoreOne(qKey, styleKey(cand.number), "style number"));
    if (qHeadKey !== qKey) consider(scoreOne(qHeadKey, styleKey(cand.number), "style number"));
    for (const a of cand.confirmedAliases ?? []) {
      if (styleKey(a) === qKey) consider({ confidence: 1, reason: `Confirmed alias "${a}"` });
    }
    for (const nme of cand.names ?? []) {
      const head = styleKey(splitStyleTitle(nme).head);
      const r = scoreOne(qKey, head, `"${nme}"`);
      // title-based matches never reach "exact": a different spelling needs confirmation
      if (r) consider({ confidence: Math.min(r.confidence, 0.9), reason: r.reason });
    }
    if (best) matches.push({ candidate: cand, ...(best as { confidence: number; reason: string }) });
  }
  matches.sort((a, b) => b.confidence - a.confidence);

  const exact = matches.filter((m) => m.confidence >= 1);
  if (exact.length === 1) {
    return { status: "EXACT", query: q, best: exact[0], others: matches.filter((m) => m !== exact[0]), message: exact[0].reason };
  }
  if (exact.length > 1) {
    return { status: "POSSIBLE", query: q, best: exact[0], others: exact.slice(1), message: "More than one style matches exactly – please confirm which one." };
  }
  const usable = matches.filter((m) => m.confidence >= 0.5);
  if (usable.length) {
    return { status: "POSSIBLE", query: q, best: usable[0], others: usable.slice(1), message: "Possible match found — please confirm." };
  }
  return { status: "NONE", query: q, best: null, others: [], message: "No existing style matches. A new style can be created." };
}

/** CAD ↔ entered style: exact normalized equality only; otherwise reported as mismatch. */
export function cadStyleMatches(entered: string, cadStyle: string | null): "MATCH" | "MISMATCH" | "UNKNOWN" {
  if (!cadStyle) return "UNKNOWN";
  return styleKey(entered) === styleKey(cadStyle) ? "MATCH" : "MISMATCH";
}
