"use client";
import * as React from "react";
import { ChevronDown, ChevronRight, Link2, AlertTriangle } from "lucide-react";
import type { ComparisonResult } from "@/lib/calculations";
import type { CostingDoc } from "@/types/costing";
import { cn, money, pct, rupee } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Combobox } from "@/components/ui/overlay";
import { api } from "@/features/costing/api";
import type { Pairing } from "@/features/costing/useWorkspace";

export function ComparisonPanel({ comparison, hasActual, hasClient, styleNumber, onPair, onClearPair, pairing, docs }: { comparison: { cmp: ComparisonResult; paired: boolean; label: string | null } | null; hasActual: boolean; hasClient: boolean; styleNumber: string; onPair: (p: Pairing) => void; onClearPair: () => void; pairing: Pairing | null; docs: { ACTUAL: CostingDoc | null; CLIENT: CostingDoc | null } }) {
  if (!comparison) {
    const missing = !hasActual && !hasClient ? null : !hasActual ? "ACTUAL" : "CLIENT";
    return (
      <div className="p-4">
        <EmptyState title="Comparison needs both costings of the same style" icon={<Link2 size={22} />}>
          {missing ? `Style ${styleNumber} has no ${missing === "ACTUAL" ? "Actual" : "Client"} costing.` : `Style ${styleNumber} has neither costing yet.`} Start one from a template, or explicitly pair this style with a costing of another style to see how the two datasets differ.
        </EmptyState>
        {missing && <PairPicker missing={missing} onPair={onPair} />}
      </div>
    );
  }
  const { cmp, paired, label } = comparison;
  const t = cmp.totals;
  const premiumTone = t.premiumPct === null ? "text-ink" : t.premiumPct >= 0 ? "text-client" : "text-bad";
  void docs;
  return (
    <div className="space-y-4 p-4">
      {paired && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-warn/30 bg-warn-soft/60 px-3 py-2 text-[12.5px] text-ink-2">
          <div className="flex gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
            <span>
              <b>Manual pairing.</b> {label} is paired with style {styleNumber} by your choice – the two costings are not for the same style, so the differences are illustrative of structure, not of one garment.
            </span>
          </div>
          <button onClick={onClearPair} className="shrink-0 text-[12px] font-medium text-accent hover:underline">Remove pairing</button>
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <Kpi label="Actual cost / pc" value={rupee(t.actualPerPc)} tone="actual" sub={`Total ${rupee(t.actualTotal)}`} />
        <Kpi label="Client cost / pc" value={rupee(t.clientPerPc)} tone="client" sub={`Final PO incl. transport ${rupee(cmp.clientPriceChain.finalPoPriceInclTransport)}`} />
        <Kpi label="Difference / pc" value={rupee(t.differencePerPc, { sign: true })} sub={`Total ${rupee(t.differenceTotal, { sign: true })}`} />
        <Kpi label="Client premium" value={pct(t.premiumPct)} valueClass={premiumTone} sub="(client − actual) ÷ actual" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-surface-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              <th className="px-3 py-2 text-left">Group</th>
              <th className="px-2 text-right text-actual">Actual / pc</th>
              <th className="px-2 text-right text-client">Client / pc</th>
              <th className="px-2 text-right">Difference</th>
              <th className="px-2 text-right">Premium</th>
              <th className="border-l border-line px-2 text-right text-actual">Actual total</th>
              <th className="px-2 text-right text-client">Client total</th>
              <th className="px-3 text-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((r) => (
              <GroupRow key={r.group} r={r} cmp={cmp} />
            ))}
            <tr className="border-t-2 border-line-strong bg-accent-soft/60 font-bold">
              <td className="px-3 py-2 uppercase tracking-wide">Total</td>
              <td className="num px-2 text-right">{money(t.actualPerPc)}</td>
              <td className="num px-2 text-right">{money(t.clientPerPc)}</td>
              <td className="num px-2 text-right">{money(t.differencePerPc)}</td>
              <td className="num px-2 text-right">{pct(t.premiumPct)}</td>
              <td className="num border-l border-line px-2 text-right">{money(t.actualTotal)}</td>
              <td className="num px-2 text-right">{money(t.clientTotal)}</td>
              <td className="num px-3 text-right">{money(t.differenceTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Margin / profit — two separate economics</div>
          <dl className="space-y-1.5 text-[12.5px]">
            <Line k="Actual · sale rate / pc (DISPATCH PCS)" v={rupee(cmp.margin.actualSaleRatePerPc)} />
            <Line k="Actual · PER PC PROFIT" v={rupee(cmp.margin.actualPerPcProfit)} />
            <Line k="Actual · profit %" v={pct(cmp.margin.actualProfitPct)} />
            <Line k="Actual · PROFIT (total)" v={rupee(cmp.margin.actualProfit)} />
            <div className="my-1 border-t border-line" />
            <Line k={`Client · Overhead+Margin${cmp.margin.clientOverheadMarginRate !== null ? ` (${(cmp.margin.clientOverheadMarginRate * 100).toFixed(1).replace(/\.0$/, "")}% of Total)` : ""} / pc`} v={rupee(cmp.margin.clientOverheadMarginPerPc)} />
          </dl>
          <p className="mt-2 text-[11px] text-ink-3">Actual profit is realised sale − actual cost. The client Overhead+Margin line is a component of the price quoted. They are shown side by side, not netted.</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Client price chain / pc</div>
          <dl className="space-y-1.5 text-[12.5px]">
            <Line k="Total Cost = FOB Price" v={rupee(cmp.clientPriceChain.fobPrice)} />
            <Line k="Finance cost" v={rupee(cmp.clientPriceChain.financeCost)} />
            <Line k="FINAL PO PRICE" v={rupee(cmp.clientPriceChain.finalPoPrice)} />
            <Line k="Transport" v={rupee(cmp.clientPriceChain.transport)} />
            <Line k="FINAL PO PRICE Incl Transport" v={rupee(cmp.clientPriceChain.finalPoPriceInclTransport)} strong />
          </dl>
        </div>
      </div>

      {(cmp.unmapped.actual.length > 0 || cmp.unmapped.client.length > 0) && (
        <div className="rounded-md border border-warn/30 bg-warn-soft/60 p-3 text-[12.5px]">
          <b>Unmapped lines</b> (no grouping rule matches – add one in Masters → Costing Rules):
          <div className="mt-1 flex flex-wrap gap-1.5">
            {[...cmp.unmapped.actual.map((l) => `Actual: ${l.item}`), ...cmp.unmapped.client.map((l) => `Client: ${l.item}`)].map((x) => (
              <Badge key={x} tone="warn">{x}</Badge>
            ))}
          </div>
        </div>
      )}
      <ul className="space-y-0.5 text-[11.5px] text-ink-3">
        {cmp.notes.map((n, i) => (
          <li key={i}>• {n}</li>
        ))}
      </ul>
      {pairing && !paired && null}
    </div>
  );
}

function GroupRow({ r, cmp }: { r: ComparisonResult["rows"][number]; cmp: ComparisonResult }) {
  const [open, setOpen] = React.useState(false);
  void cmp;
  const diffTone = r.differencePerPc > 0.005 ? "text-client" : r.differencePerPc < -0.005 ? "text-bad" : "text-ink-3";
  return (
    <>
      <tr className="border-t border-line hover:bg-[#f7f9fc]">
        <td className="px-3 py-1.5">
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 font-medium">
            {open ? <ChevronDown size={13} className="text-ink-3" /> : <ChevronRight size={13} className="text-ink-3" />}
            {r.group}
          </button>
        </td>
        <td className="num px-2 text-right">{money(r.actualPerPc)}</td>
        <td className="num px-2 text-right">{money(r.clientPerPc)}</td>
        <td className={cn("num px-2 text-right font-medium", diffTone)}>{money(r.differencePerPc)}</td>
        <td className="num px-2 text-right text-ink-2">{pct(r.premiumPct, 1)}</td>
        <td className="num border-l border-line px-2 text-right">{money(r.actualTotal)}</td>
        <td className="num px-2 text-right">{money(r.clientTotal)}</td>
        <td className={cn("num px-3 text-right", diffTone)}>{money(r.differenceTotal)}</td>
      </tr>
      {open && (
        <tr className="bg-surface-2">
          <td colSpan={8} className="px-9 py-2 text-[11.5px] text-ink-2">
            <div className="grid grid-cols-2 gap-6">
              <div><span className="font-semibold text-actual">Actual lines:</span> {r.actualLineIds.length ? r.actualLineIds.map((id) => id.split(":")[1]?.replace(/_/g, " ")).join(", ") : "—"}</div>
              <div><span className="font-semibold text-client">Client lines:</span> {r.clientLineIds.length ? r.clientLineIds.map((id) => id.split(":")[1]?.replace(/_/g, " ")).join(", ") : "—"}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Kpi({ label, value, sub, tone, valueClass }: { label: string; value: string; sub?: string; tone?: "actual" | "client"; valueClass?: string }) {
  return (
    <div className={cn("rounded-lg border bg-surface p-3", tone === "actual" ? "border-actual/25" : tone === "client" ? "border-client/25" : "border-line")}>
      <div className={cn("text-[10.5px] font-semibold uppercase tracking-[0.07em]", tone === "actual" ? "text-actual" : tone === "client" ? "text-client" : "text-ink-3")}>{label}</div>
      <div className={cn("num mt-1 text-[22px] font-bold leading-none", valueClass)}>{value}</div>
      {sub && <div className="num mt-1.5 truncate text-[11px] text-ink-3">{sub}</div>}
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-ink-2", strong && "font-semibold text-ink")}>{k}</dt>
      <dd className={cn("num", strong ? "font-bold" : "font-medium")}>{v}</dd>
    </div>
  );
}

function PairPicker({ missing, onPair }: { missing: "ACTUAL" | "CLIENT"; onPair: (p: Pairing) => void }) {
  const [opts, setOpts] = React.useState<Array<{ styleId: string; styleNumber: string; color: string | null; versionNo: number }>>([]);
  const [val, setVal] = React.useState<string | null>(null);
  React.useEffect(() => {
    api.templates(missing).then(setOpts).catch(() => setOpts([]));
  }, [missing]);
  return (
    <div className="mx-auto mt-2 max-w-md rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Pair with an existing {missing === "ACTUAL" ? "Actual" : "Client"} costing (manual)</div>
      <Combobox
        value={val}
        options={opts.map((o) => ({ value: o.styleId, label: `${o.styleNumber}${o.color ? ` · ${o.color}` : ""}`, hint: `v${o.versionNo}` }))}
        onChange={async (id) => {
          setVal(id);
          if (!id) return;
          const w = await api.workspace(id);
          const v = missing === "ACTUAL" ? w.actual : w.client;
          if (v) onPair({ type: missing, doc: v.doc, label: `${missing === "ACTUAL" ? "Actual" : "Client"} costing of style ${w.style.number} (v${v.versionNo})` });
        }}
        placeholder="Choose a style…"
        searchPlaceholder="Search style…"
      />
    </div>
  );
}
