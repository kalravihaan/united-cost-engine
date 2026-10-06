"use client";
import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, History, Eye } from "lucide-react";
import type { ActualCosting, ClientCosting, CostingDoc, CostingResult, ValidationIssue } from "@/types/costing";
import { explainCosting } from "@/lib/calculations";
import { dateTime, money, pct, rupee, cn } from "@/lib/format";
import { Badge, Button, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api, type AuditRow, type VersionRow } from "./api";
import { ORIGIN_LABEL, refText } from "./provenance";
import { listOverrides } from "@/lib/calculations";

/* ───────────── calculation chain ───────────── */
export function ChainPanel({ doc, result }: { doc: CostingDoc; result: CostingResult }) {
  const steps = explainCosting(doc, result);
  const overrides = listOverrides(doc);
  return (
    <div className="grid grid-cols-[1.4fr_1fr] gap-6 p-4">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Calculation chain · {doc.type === "ACTUAL" ? "actual costing.xlsx" : "client costing.xlsx"} formulas</div>
        <table className="w-full text-[12.5px]">
          <tbody>
            {steps.map((s, i) => (
              <tr key={i} className={cn("border-t border-line", s.emphasis && "bg-accent-soft/50")}>
                <td className={cn("py-1.5 pl-2 pr-3", s.emphasis ? "font-bold" : "font-medium")}>{s.label}</td>
                <td className="py-1.5 pr-3 font-mono text-[11px] text-ink-3">{s.formula}{s.note && <span className="ml-2 font-sans text-warn">{s.note}</span>}</td>
                <td className={cn("num py-1.5 pr-2 text-right", s.emphasis ? "font-bold" : "font-semibold")}>{s.value === null ? "—" : s.kind === "percent" ? pct(s.value) : rupee(s.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Where the key numbers come from</div>
          <ul className="space-y-2">
            {keyTraces(doc).map((t, i) => (
              <li key={i} className="rounded-md border border-line p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold">{t.label}</span>
                  <Badge tone={t.origin === "CAD" ? "cad" : t.origin === "OVERRIDE" ? "warn" : "neutral"}>{ORIGIN_LABEL[t.origin]}</Badge>
                </div>
                <div className="num mt-0.5 text-[12px] text-ink-2">{t.value}</div>
                <div className="mt-0.5 text-[11px] text-ink-3">{t.source}</div>
                {t.original && <div className="mt-1 rounded bg-warn-soft/60 px-1.5 py-1 text-[11px] text-ink-2">{t.original}</div>}
              </li>
            ))}
            {keyTraces(doc).length === 0 && <li className="text-[12px] text-ink-3">No CAD-derived or overridden values in this costing.</li>}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Manual overrides ({overrides.length})</div>
          {overrides.length === 0 ? (
            <div className="text-[12px] text-ink-3">None.</div>
          ) : (
            <ul className="space-y-1.5">
              {overrides.map((o, i) => (
                <li key={i} className="text-[12px]">
                  <span className="font-medium">{o.item || o.lineId}</span> · {o.field}: <span className="num font-semibold">{String(o.value)}</span> <span className="text-ink-3">(was [{o.original ? ORIGIN_LABEL[o.original.origin] : "?"}] {String(o.original?.value ?? "blank")})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function keyTraces(doc: CostingDoc) {
  const out: Array<{ label: string; origin: keyof typeof ORIGIN_LABEL; value: string; source: string; original?: string }> = [];
  const push = (label: string, value: string, prov?: { origin: keyof typeof ORIGIN_LABEL; ref?: import("@/types/costing").SourceRef; original?: { value: unknown; origin: keyof typeof ORIGIN_LABEL; ref?: import("@/types/costing").SourceRef } }) => {
    if (!prov) return;
    if (prov.origin === "IMPORT" || prov.origin === "DEFAULT") return;
    out.push({ label, origin: prov.origin, value, source: refText(prov.ref) || "—", original: prov.original ? `Original [${ORIGIN_LABEL[prov.original.origin]}] ${String(prov.original.value ?? "blank")}${prov.original.ref ? " — " + refText(prov.original.ref) : ""}` : undefined });
  };
  if (doc.type === "ACTUAL") push("Consumption", `${doc.actual.consumption.value ?? "—"} m / pc`, doc.actual.consumption.prov);
  for (const l of doc.lines) {
    if (l.removed) continue;
    push(`${l.item || l.sectionLabel} · quantity`, `${l.quantity ?? "—"} ${l.uom ?? ""}`.trim(), l.prov.quantity);
    push(`${l.item || l.sectionLabel} · rate`, `${l.rate ?? "—"}`, l.prov.rate);
  }
  return out;
}

/* ───────────── validation ───────────── */
export function ChecksPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return <EmptyState title="No issues found" icon={<CheckCircle2 size={22} className="text-ok" />}>Critical inputs are present and consistent.</EmptyState>;
  const groups: Array<[ValidationIssue["level"], string]> = [["error", "Errors"], ["warning", "Warnings"], ["info", "Notes"]];
  return (
    <div className="space-y-4 p-4">
      {groups.map(([lvl, title]) => {
        const xs = issues.filter((i) => i.level === lvl);
        if (!xs.length) return null;
        return (
          <div key={lvl}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
              {lvl === "error" ? <AlertCircle size={13} className="text-bad" /> : lvl === "warning" ? <AlertTriangle size={13} className="text-warn" /> : <Info size={13} />}
              {title} ({xs.length})
            </div>
            <ul className="divide-y divide-line rounded-md border border-line">
              {xs.map((i, k) => (
                <li key={k} className="flex items-start gap-2 px-3 py-1.5 text-[12.5px]">
                  <Badge tone={lvl === "error" ? "bad" : lvl === "warning" ? "warn" : "neutral"} className="mt-0.5 shrink-0">{i.code}</Badge>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── versions ───────────── */
export function VersionsPanel({ styleId, type, currentVersionNo, historicId, onOpen, refreshKey }: { styleId: string; type: "ACTUAL" | "CLIENT"; currentVersionNo?: number; historicId?: string; onOpen: (id: string) => void; refreshKey: number }) {
  const [rows, setRows] = React.useState<VersionRow[] | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    setRows(null);
    api.versions(styleId, type).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [styleId, type, refreshKey]);
  if (rows === null) return <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>;
  if (rows.length === 0) return <EmptyState title="No saved versions" icon={<History size={22} />}>Save the costing to create version 1. Versions are never overwritten.</EmptyState>;
  return (
    <div className="p-4">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            <th className="py-1.5">Version</th>
            <th>Date</th>
            <th>User</th>
            <th>Source</th>
            <th className="text-right">{type === "ACTUAL" ? "Cost / pc" : "FOB / pc"}</th>
            <th className="text-right">{type === "ACTUAL" ? "Total cost" : "Final PO incl. transport"}</th>
            <th className="text-right">Changes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <React.Fragment key={r.id}>
              <tr className="border-t border-line">
                <td className="py-1.5 font-semibold">v{r.versionNo} {r.versionNo === currentVersionNo && <Badge tone="ok" className="ml-1">LATEST</Badge>} {r.id === historicId && <Badge tone="warn" className="ml-1">OPEN</Badge>}</td>
                <td className="text-ink-2">{dateTime(r.createdAt)}</td>
                <td className="text-ink-2">{r.createdBy}</td>
                <td className="text-ink-2"><Badge tone={r.sourceKind === "IMPORT" ? "neutral" : r.sourceKind === "TEMPLATE" ? "warn" : "accent"}>{r.sourceKind}</Badge>{r.sourceSheet && <span className="ml-1.5 text-[11px] text-ink-3">{r.sourceFile} → {r.sourceSheet}</span>}</td>
                <td className="num text-right">{rupee(r.costPerPc)}</td>
                <td className="num text-right">{rupee(type === "ACTUAL" ? r.totalCost : r.finalPoPrice)}</td>
                <td className="text-right">
                  <button onClick={() => setOpen(open === r.id ? null : r.id)} className="text-[12px] text-accent hover:underline">{r.changedFields.length} field{r.changedFields.length === 1 ? "" : "s"}</button>
                </td>
                <td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(r.id)}><Eye size={12} /> Open</Button>
                </td>
              </tr>
              {open === r.id && (
                <tr className="bg-surface-2">
                  <td colSpan={8} className="px-3 py-2">
                    {r.note && <div className="mb-1 text-[12px] text-ink-2">“{r.note}”</div>}
                    <ul className="max-h-48 space-y-0.5 overflow-auto text-[12px]">
                      {r.changedFields.slice(0, 80).map((c, i) => (
                        <li key={i}><span className="font-mono text-[11px] text-ink-2">{c.path}</span>: <span className="num text-ink-3">{String(c.before ?? "∅")}</span> → <span className="num font-semibold">{String(c.after ?? "∅")}</span></li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── audit ───────────── */
export function AuditPanel({ styleId, refreshKey }: { styleId: string; refreshKey: number }) {
  const [rows, setRows] = React.useState<AuditRow[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    api.audit(styleId).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [styleId, refreshKey]);
  if (rows === null) return <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>;
  if (rows.length === 0) return <EmptyState title="No audit events yet" />;
  return (
    <ul className="divide-y divide-line p-2">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start gap-3 px-2 py-2 text-[12.5px]">
          <span className="w-[150px] shrink-0 text-ink-3">{dateTime(r.at)}</span>
          <span className="w-[120px] shrink-0 font-medium">{r.userName}</span>
          <Badge tone="neutral" className="shrink-0">{r.action}</Badge>
          <span className="min-w-0 truncate font-mono text-[11px] text-ink-3" title={JSON.stringify(r.details)}>{JSON.stringify(r.details)}</span>
        </li>
      ))}
    </ul>
  );
}

export { money };
export type { ActualCosting, ClientCosting };
