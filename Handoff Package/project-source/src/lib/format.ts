const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty4 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export const rupee = (v: number | null | undefined, opts: { sign?: boolean } = {}): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = inr2.format(Math.abs(v));
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}₹${s}`;
};

export const money = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? "—" : inr2.format(v));

export const qty = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? "" : qty4.format(v));

export const pct = (v: number | null | undefined, dp = 2): string => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${v.toFixed(dp)}%`);

/** fraction → "12%" (no trailing zeros) */
export const fracPct = (f: number | null | undefined): string => (f === null || f === undefined ? "" : `${parseFloat((f * 100).toFixed(4))}%`);

export const dateTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export const cn = (...xs: Array<string | false | null | undefined>): string => xs.filter(Boolean).join(" ");
