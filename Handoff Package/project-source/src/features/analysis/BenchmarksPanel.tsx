"use client";
import * as React from "react";
import { BarChart3 } from "lucide-react";
import type { ActualCosting, ActualResult } from "@/types/costing";
import type { RuleSet } from "@/types/rules";
import { benchmarkActual, type BenchRow, type BenchStatus } from "@/lib/analysis/benchmarks";
import { cn, money } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui/primitives";

const STATUS: Record<BenchStatus, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  within: { label: "within range", tone: "ok" },
  below: { label: "below range", tone: "warn" },
  above: { label: "above range", tone: "bad" },
  na: { label: "for reference", tone: "neutral" },
};

export function BenchmarksPanel({ styleNumber, brand, clientFormat, doc, result, rules }: { styleNumber: string; brand: string | null; clientFormat: string | null; doc: ActualCosting | null; result: ActualResult | null; rules: RuleSet | null }) {
  const touched = !!doc && doc.lines.some((l) => (l.quantity ?? 0) !== 0 || (l.rate ?? 0) !== 0);
  const rep = React.useMemo(() => (doc && result && rules && touched ? benchmarkActual({ styleNumber, brand, clientFormat, doc, result, rules }) : null), [styleNumber, brand, clientFormat, doc, result, rules, touched]);
  if (!rep) {
    return (
      <div className="p-4">
        <EmptyState title="Nothing to benchmark yet" icon={<BarChart3 size={22} />}>
          Enter the Actual costing of this style (quantities and rates) and it is compared here with the standards learnt from the reference sheets.
        </EmptyState>
      </div>
    );
  }
  const flagged = rep.rows.filter((r) => r.status === "above" || r.status === "below");
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Compared with</span>
        <Badge tone="accent">{rep.segment}</Badge>
        <Badge tone="neutral">{rep.embellished ? "embellished" : "plain"}</Badge>
        <Badge tone="neutral">{rep.cluster}</Badge>
        {rep.fabricType && rep.fabricType !== "Other" && <Badge tone="neutral">{rep.fabricType}</Badge>}
      </div>
      {rep.noStandard && (
        <div className="rounded-md border border-warn/30 bg-warn-soft/60 p-3 text-[12.5px]">No standard exists yet for this segment and type, so the cost bands are blank. Rates and consumption still compare with the brand family.</div>
      )}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="bg-surface-2 text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
            <tr>
              <th className="px-3 py-2 text-left">Measure</th>
              <th className="px-2 text-right">This costing</th>
              <th className="px-2 text-right">Low</th>
              <th className="px-2 text-right">Typical</th>
              <th className="px-2 text-right">High</th>
              <th className="px-2 text-right">Sheets</th>
              <th className="px-3 text-left">Reading</th>
            </tr>
          </thead>
          <tbody>
            {rep.rows.map((r) => (
              <Row key={r.key} r={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-ink-3">
        {flagged.length === 0 ? "Every measure is inside the range seen on the reference sheets." : `${flagged.length} measure${flagged.length === 1 ? " is" : "s are"} outside the range seen on the reference sheets – worth a second look, not necessarily wrong.`}{" "}
        Standards are medians and ranges of the sheets in the Analysis page; samples under 5 sheets are indicative only. Nothing here changes the costing.
      </p>
    </div>
  );
}

function Row({ r }: { r: BenchRow }) {
  const s = STATUS[r.status];
  const f = (v: number | null) => (v === null ? "—" : money(v));
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2">
        <div className="font-medium">{r.label}</div>
        {r.note && <div className="text-[11px] text-ink-3">{r.note}</div>}
      </td>
      <td className={cn("num px-2 text-right font-semibold", r.status === "above" && "text-bad", r.status === "below" && "text-warn")}>{f(r.value)} <span className="text-[10.5px] font-normal text-ink-3">{r.unit}</span></td>
      <td className="num px-2 text-right text-ink-2">{f(r.low)}</td>
      <td className="num px-2 text-right text-ink-2">{f(r.mid)}</td>
      <td className="num px-2 text-right text-ink-2">{f(r.high)}</td>
      <td className="num px-2 text-right text-ink-3">{r.n ?? "—"}</td>
      <td className="px-3"><Badge tone={s.tone}>{s.label}</Badge></td>
    </tr>
  );
}
