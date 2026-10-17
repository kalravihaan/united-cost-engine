/**
 * Numbers in the costing sheets are often typed as sums (=4065+1617 pieces, =1.1+0.8+1.35+0.05+0.17 m consumption,
 * =62.32+53.27 CMT). Number cells accept the same: + − × ÷, brackets, unary minus. No eval; anything else is rejected.
 */
export function evalExpression(input: string): number | null {
  if (/[\d.]\s+[\d.]/.test(input)) return null; // "1 2" is not 12
  const s = input.replace(/[,\s]/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!s || !/^[-+*/().\d]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  function number(): number | null {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  }
  function factor(): number | null {
    if (peek() === "-") { i++; const v = factor(); return v === null ? null : -v; }
    if (peek() === "+") { i++; return factor(); }
    if (peek() === "(") {
      i++;
      const v = sum();
      if (v === null || peek() !== ")") return null;
      i++;
      return v;
    }
    return number();
  }
  function product(): number | null {
    let v = factor();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = s[i++];
      const r = factor();
      if (r === null || (op === "/" && r === 0)) return null;
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function sum(): number | null {
    let v = product();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = s[i++];
      const r = product();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  // 0.1+0.2 → 0.30000000000000004: keep 12 significant digits so typed sums store the number the user means
  return v !== null && i === s.length && Number.isFinite(v) ? Number(v.toPrecision(12)) : null;
}

/** true when the text is more than a plain number (it needs evaluating) */
export const isExpression = (text: string) => !/^-?[\d,]*\.?\d*$/.test(text.trim());
