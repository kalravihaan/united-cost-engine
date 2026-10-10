"use client";
import * as React from "react";
import { ArrowRight } from "lucide-react";
import type { ActualCosting } from "@/types/costing";
import { applyStandardRates, planStandardRates, type MasterRate, type StandardChange, type StandardPlan } from "@/lib/analysis/applyStandards";
import { cn, money } from "@/lib/format";
import { Badge, Button, Skeleton } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { api } from "@/features/costing/api";
import { getUserName } from "@/features/costing/user";

/**
 * "Apply standard rates": shows which rates of the Rate masters would go into this Actual costing, lets the user tick them, and writes them
 * (origin Master, replaced values kept as the line's original). Nothing is written until Apply; Discard undoes unsaved changes.
 */
export function StandardRatesDialog({ open, onOpenChange, doc, styleNumber, clientFormat, brand, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; doc: ActualCosting | null; styleNumber: string; clientFormat: string | null; brand: string | null; onApply: (fn: (d: ActualCosting) => ActualCosting, count: number) => void }) {
  const [masters, setMasters] = React.useState<MasterRate[] | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [autoLoaded, setAutoLoaded] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setMasters(null);
    setFailed(null);
    setAutoLoaded(0);
    // an older database / saved data file may predate the standards: load them first (never touches rows you added)
    api.ensureStandardRates().then((r) => { if (r.loaded) setAutoLoaded(r.loaded.rates.added); }).catch(() => undefined).then(() => api.masterList("rates")).then((r) => setMasters(r as unknown as MasterRate[])).catch((e) => setFailed((e as Error).message));
  }, [open]);

  const plan: StandardPlan | null = React.useMemo(() => (doc && masters ? planStandardRates(doc, masters, { styleNumber, clientFormat, brand }) : null), [doc, masters, styleNumber, clientFormat, brand]);
  React.useEffect(() => {
    if (plan) setPicked(new Set(plan.changes.filter((c) => !c.overwrites).map((c) => c.lineId)));
  }, [plan]);

  const chosen = plan ? plan.changes.filter((c) => picked.has(c.lineId)) : [];
  const toggle = (c: StandardChange) => setPicked((s) => { const x = new Set(s); if (x.has(c.lineId)) x.delete(c.lineId); else x.add(c.lineId); return x; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Apply standard rates" description="Fills the rate of CMT, trims and embellishment rows from Masters → Rate Masters. Quantities are not touched." width="max-w-3xl">
      {failed ? (
        <div className="rounded-md border border-bad/30 bg-bad-soft p-3 text-[12.5px] text-bad">Could not read the Rate masters: {failed}</div>
      ) : !plan ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="font-semibold">Standards for</span>
            <Badge tone="accent">{plan.segment}</Badge>
            <Badge tone="neutral">{plan.cluster}</Badge>
            <Badge tone="neutral">trims: {plan.family}</Badge>
          </div>
          {autoLoaded > 0 && (
            <div className="rounded-md border border-ok/30 bg-ok-soft/60 p-3 text-[12.5px]">The Rate masters had no standards yet, so {autoLoaded} standard rates were loaded into Masters → Rate Masters. Your own rows are untouched.</div>
          )}
          {masters && masters.length === 0 && (
            <div className="rounded-md border border-warn/30 bg-warn-soft/60 p-3 text-[12.5px]">The Rate masters are empty. Open Masters → Rate Masters and use <b>Load standard rates</b> first.</div>
          )}
          {plan.changes.length === 0 ? (
            <div className="rounded-md border border-line bg-surface-2 p-3 text-[12.5px] text-ink-2">
              Nothing to apply:{" "}
              {[
                plan.alreadyAtStandard.length > 0 && `${plan.alreadyAtStandard.length} row${plan.alreadyAtStandard.length === 1 ? " is" : "s are"} already at the standard`,
                plan.keptTyped.length > 0 && `${plan.keptTyped.length} with a rate you typed`,
                plan.noStandard.length > 0 && `${plan.noStandard.length} with no standard`,
              ].filter(Boolean).join(", ") || "no CMT, trims or embellishment row matches a Rate master"}
              .
            </div>
          ) : (
            <div className="max-h-[48vh] overflow-auto rounded-lg border border-line">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-surface-2 text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 text-left">Row</th>
                    <th className="px-2 text-right">Now → standard</th>
                    <th className="px-2 text-left">From</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.changes.map((c) => (
                    <tr key={c.lineId} className="border-t border-line">
                      <td className="px-2"><input type="checkbox" aria-label={`Apply ${c.item}`} checked={picked.has(c.lineId)} onChange={() => toggle(c)} /></td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium">{c.item}</div>
                        <div className="text-[11px] text-ink-3">{c.sectionKey === "FABRIC_ORDER" ? "fabric order add-on" : c.sectionKey.toLowerCase()}{c.hasQuantity ? "" : " · no quantity yet"}</div>
                      </td>
                      <td className="num px-2 text-right">
                        <span className="text-ink-3">{c.from === null || c.from === 0 ? "blank" : money(c.from)}</span> <ArrowRight size={11} className="inline text-ink-3" /> <span className="font-semibold">{money(c.to)}</span>
                        {c.overwrites && <div><Badge tone="warn">replaces a rate</Badge></div>}
                      </td>
                      <td className="px-2 text-[11.5px] text-ink-2">
                        {c.master}
                        <div className={cn("text-[10.5px]", c.indicative ? "text-warn" : "text-ink-3")}>{c.source.replace(/^Standard rates( v\d+)? · /, "")}{c.indicative ? " · indicative (few sheets)" : ""}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="space-y-0.5 text-[11.5px] text-ink-3">
            <li>Fabric rows are never filled: the standard fabric figure is a landed rate (purchase + finishing) and depends on the supplier.</li>
            {plan.keptTyped.length > 0 && <li>Kept as typed (never replaced): {plan.keptTyped.join(", ")}.</li>}
            {plan.noStandard.length > 0 && <li>No standard for: {plan.noStandard.join(", ")}.</li>}
            <li>Applied rates are marked <b>Master</b> and the value they replace stays on the line; <b>Discard</b> undoes everything unsaved, and each saved version keeps its own rates.</li>
          </ul>
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[12px] text-ink-2">{chosen.length} selected</span>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" disabled={chosen.length === 0} onClick={() => { onApply((d) => applyStandardRates(d, chosen, { by: getUserName() }), chosen.length); onOpenChange(false); }}>
              Apply {chosen.length} rate{chosen.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
