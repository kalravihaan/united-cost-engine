"use client";
import * as React from "react";
import { ChevronDown, ChevronRight, Plus, RotateCw, Trash2, Info } from "lucide-react";
import type { ActualCosting, ActualResult, ClientCosting, ClientResult, CostLine, CostingDoc, LineField, ValidationIssue } from "@/types/costing";
import { addLine, removeLine, restoreLine, revertOverride, setLineField } from "@/lib/calculations";
import { slug } from "@/lib/normalization/labels";
import { cn, dateTime, money, rupee, pct } from "@/lib/format";
import { Badge, Button } from "@/components/ui/primitives";
import { Tip } from "@/components/ui/overlay";
import { NumberCell, TextCell } from "./cells";
import { ProvTag, FIELD_COLUMN, refText } from "./provenance";
import { getUserName } from "./user";

type Edit<T extends CostingDoc> = (fn: (d: T) => T) => void;

interface BaseProps {
  readOnly?: boolean;
  uoms: string[];
  issues: ValidationIssue[];
  showRemoved: boolean;
}

/* ───────────── shared pieces ───────────── */

function useCollapsed() {
  const [c, setC] = React.useState<Record<string, boolean>>({});
  return { collapsed: c, toggle: (k: string) => setC((x) => ({ ...x, [k]: !x[k] })) };
}

function lineIssues(issues: ValidationIssue[], id: string) {
  return issues.filter((i) => i.lineId === id);
}

function IssueMark({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  const worst = issues.some((i) => i.level === "error") ? "error" : issues.some((i) => i.level === "warning") ? "warning" : "info";
  return (
    <Tip
      content={
        <ul className="space-y-0.5">
          {issues.map((i, k) => (
            <li key={k}>• {i.message}</li>
          ))}
        </ul>
      }
    >
      <span className={cn("inline-flex h-4 w-4 shrink-0 cursor-help items-center justify-center rounded-full text-[10px] font-bold", worst === "error" ? "bg-bad-soft text-bad" : worst === "warning" ? "bg-warn-soft text-warn" : "bg-black/5 text-ink-3")}>
        {worst === "info" ? "i" : "!"}
      </span>
    </Tip>
  );
}

function SourceMark({ line }: { line: CostLine }) {
  const r = line.sourceRef;
  return (
    <Tip
      content={
        <div className="space-y-0.5">
          <div className="font-semibold">{line.custom ? "Added in this costing" : "Imported line"}</div>
          {r && <div className="text-white/80">{refText(r)}</div>}
          {line.sourceFormula && <div className="font-mono text-[11px] text-white/80">Source formula: {line.sourceFormula}</div>}
          {line.calc === "PERCENT_OF_SUBTOTAL" && <div className="text-amber-200">Calculated as % of Total; quantity is not used (as in the source).</div>}
        </div>
      }
    >
      <span className="cursor-help text-ink-3 hover:text-ink-2">
        <Info size={13} />
      </span>
    </Tip>
  );
}

function SectionHeader({ label, count, collapsed, onToggle, accent, span, cells, trail, note }: { label: string; count: number; collapsed: boolean; onToggle: () => void; accent: "actual" | "client"; span: number; cells: React.ReactNode[]; trail: number; note?: string }) {
  return (
    <tr className="border-y border-line bg-surface-2">
      <td colSpan={span} className="px-2 py-1.5">
        <div className="flex items-center gap-3">
          <button onClick={onToggle} className="flex items-center gap-1.5 text-left" aria-expanded={!collapsed}>
            {collapsed ? <ChevronRight size={14} className="text-ink-3" /> : <ChevronDown size={14} className="text-ink-3" />}
            <span className={cn("text-[11.5px] font-bold uppercase tracking-[0.07em]", accent === "actual" ? "text-actual" : "text-client")}>{label}</span>
            <span className="rounded-full bg-black/[0.06] px-1.5 text-[10.5px] font-semibold text-ink-2">{count}</span>
          </button>
          {note && <span className="text-[11px] text-ink-3">{note}</span>}
        </div>
      </td>
      {cells.map((c, k) => (
        <td key={k} className="num px-1.5 py-1.5 text-right text-[12.5px]">{c}</td>
      ))}
      {trail > 0 && <td colSpan={trail} />}
    </tr>
  );
}

function AddComponent({ onAdd, colSpan }: { onAdd: (name: string) => void; colSpan: number }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const submit = () => {
    if (name.trim()) onAdd(name.trim());
    setName("");
    setOpen(false);
  };
  return (
    <tr>
      <td colSpan={colSpan} className="px-2 py-1">
        {open ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Component name"
              className="h-7 w-64 rounded border border-accent bg-white px-2 text-[12.5px] outline-none ring-2 ring-accent/15"
            />
            <Button size="sm" variant="primary" onClick={submit}>
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-medium text-ink-3 hover:bg-black/5 hover:text-accent">
            <Plus size={13} /> Add component
          </button>
        )}
      </td>
    </tr>
  );
}

const th = "px-1.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3";

function newLine(sectionKey: string, sectionLabel: string, item: string, calc: CostLine["calc"] = "QTY_X_RATE", currency = "INR"): CostLine {
  return {
    id: `custom:${sectionKey}:${slug(item) || "item"}:${Date.now().toString(36)}`,
    sectionKey,
    sectionLabel,
    item,
    description: "",
    itemType: null,
    quantity: null,
    uom: null,
    rate: null,
    gstRate: null,
    currency,
    calc,
    attributes: {},
    prov: {},
    custom: true,
  };
}

/* ───────────── ACTUAL ───────────── */

export function ActualTable({ doc, result, edit, issues, uoms, readOnly, showRemoved }: BaseProps & { doc: ActualCosting; result: ActualResult; edit: Edit<ActualCosting> }) {
  const { collapsed, toggle } = useCollapsed();
  const by = getUserName();
  const setF = (id: string, f: LineField, v: number | string | null) => edit((d) => setLineField(d, id, f, v, { by }));
  const revert = (id: string, f: LineField) => edit((d) => revertOverride(d, id, f));

  const sections: Array<{ key: string; label: string }> = [
    { key: "FABRIC_ORDER", label: "FABRIC ORDER" },
    { key: "CMT", label: "CMT" },
    { key: "TRIMS", label: "TRIMS" },
    { key: "LD_CHARGES", label: "LD CHARGES" },
  ];
  const a = doc.actual;
  const dispatch = a.dispatchPcs.qty ?? 0;

  const setPcs = (which: "orderPcs" | "dispatchPcs", f: "qty" | "rate", v: number | null) =>
    edit((d) => ({ ...d, actual: { ...d.actual, [which]: { ...d.actual[which], [f]: v } } }));

  return (
    <div className="overflow-x-auto">
      <datalist id="uom-list">{uoms.map((u) => <option key={u} value={u} />)}</datalist>
      {/* ORDER INFORMATION */}
      <div className="grid grid-cols-[1.2fr_1fr] gap-4 border-b border-line px-4 py-3">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Order information</div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                <th className={cn(th, "text-left")} />
                <th className={cn(th, "w-24 text-right")}>QTY</th>
                <th className={cn(th, "w-24 text-right")}>RATE</th>
                <th className={cn(th, "w-28 text-right")}>SALE</th>
              </tr>
            </thead>
            <tbody>
              {(["orderPcs", "dispatchPcs"] as const).map((k) => (
                <tr key={k} className="border-t border-line">
                  <td className="px-1.5 py-1 font-medium">{k === "orderPcs" ? "ORDER PCS" : "DISPATCH PCS"}</td>
                  <td><NumberCell value={a[k].qty} onCommit={(v) => setPcs(k, "qty", v)} disabled={readOnly} ariaLabel={`${k} qty`} /></td>
                  <td><NumberCell value={a[k].rate} onCommit={(v) => setPcs(k, "rate", v)} disabled={readOnly} ariaLabel={`${k} rate`} /></td>
                  <td className="num px-1.5 text-right font-medium">{money(k === "orderPcs" ? result.orderSale : result.dispatchSale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Consumption</div>
          <div className="flex items-center gap-2">
            <div className="w-28">
              <NumberCell
                value={a.consumption.value}
                disabled={readOnly}
                ariaLabel="Consumption"
                suffix="m"
                onCommit={(v) =>
                  edit((d) => {
                    const prev = d.actual.consumption;
                    const hadValue = prev.value !== null && prev.prov && prev.prov.origin !== "MANUAL";
                    const prov = hadValue
                      ? prev.prov!.origin === "OVERRIDE" && prev.prov!.original?.value === v
                        ? { origin: prev.prov!.original.origin, ref: prev.prov!.original.ref }
                        : { origin: "OVERRIDE" as const, original: prev.prov!.origin === "OVERRIDE" ? prev.prov!.original : { value: prev.value, origin: prev.prov!.origin, ref: prev.prov!.ref }, at: new Date().toISOString(), by }
                      : { origin: "MANUAL" as const, at: new Date().toISOString(), by };
                    return { ...d, actual: { ...d.actual, consumption: { value: v, prov } } };
                  })
                }
              />
            </div>
            <ProvTag
              prov={a.consumption.prov}
              value={a.consumption.value}
              unit="m"
              label="Consumption (per pc)"
              onRevert={() =>
                edit((d) => {
                  const p = d.actual.consumption.prov;
                  if (p?.origin !== "OVERRIDE" || !p.original) return d;
                  return { ...d, actual: { ...d.actual, consumption: { value: p.original.value as number | null, prov: { origin: p.original.origin, ref: p.original.ref } } } };
                })
              }
            />
            {a.consumption.formula && <span className="font-mono text-[11px] text-ink-3">{a.consumption.formula}</span>}
          </div>
          <div className="mt-2 text-[11.5px] text-ink-3">
            Per-piece fabric consumption (source “CONSUPMTION”).{" "}
            {result.impliedFabricRequirement !== null && (
              <span>
                Implied for the order: <span className="num font-medium text-ink-2">{(result.impliedFabricRequirement).toLocaleString("en-IN", { maximumFractionDigits: 0 })} m</span> (reference only – the fabric-order quantity below is what is costed).
              </span>
            )}
          </div>
          {a.notes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {a.notes.map((n, i) => (
                <Badge key={i} tone="neutral" title="Note from the source sheet (column G)">
                  {n}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <table className="w-full table-fixed text-[12.5px]">
        <colgroup>
          <col />
          <col className="w-[96px]" />
          <col className="w-[92px]" />
          <col className="w-[120px]" />
          <col className="w-[84px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <th className={cn(th, "text-left pl-4")}>Particulars</th>
            <th className={cn(th, "text-right")}>QTY</th>
            <th className={cn(th, "text-right")}>RATE</th>
            <th className={cn(th, "text-right")}>PURCHASE</th>
            <th className={cn(th, "text-right")} />
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => {
            const lines = doc.lines.filter((l) => l.sectionKey === s.key && (showRemoved || !l.removed));
            const total = result.sections.find((x) => x.key === s.key)?.total ?? 0;
            const isCollapsed = collapsed[s.key];
            return (
              <React.Fragment key={s.key}>
                <SectionHeader label={s.label} count={lines.filter((l) => !l.removed).length} collapsed={!!isCollapsed} onToggle={() => toggle(s.key)} accent="actual" span={3} trail={1} note={s.key === "FABRIC_ORDER" ? "Total fabric cost" : s.key === "TRIMS" ? "Total trims cost" : "Subtotal"} cells={[<span key="t" className="font-semibold text-ink">{money(total)}</span>]} />
                {!isCollapsed &&
                  lines.map((l) => (
                    <ActualRow key={l.id} line={l} total={result.lineTotals[l.id] ?? 0} setF={setF} revert={revert} edit={edit} issues={lineIssues(issues, l.id)} readOnly={readOnly} />
                  ))}
                {!isCollapsed && !readOnly && s.key !== "LD_CHARGES" && (
                  <AddComponent colSpan={5} onAdd={(name) => edit((d) => addLine(d, newLine(s.key, s.label, name)))} />
                )}
              </React.Fragment>
            );
          })}

          <SummaryRow label="Total Cost" hint="Σ(trims, fabric, CMT, LD charges) − deduction" value={rupee(result.totalCost)} strong />
          {result.deduction !== 0 && <SummaryRow label="Deduction (D4)" value={rupee(-result.deduction)} />}
          <SummaryRow label="Cost per pc" hint={`Total Cost ÷ DISPATCH PCS (${dispatch.toLocaleString("en-IN")})`} value={result.costPerPc === null ? "— (no dispatch pcs)" : rupee(result.costPerPc)} strong />
          <SummaryRow label="PROFIT" hint="DISPATCH sale − Total Cost" value={rupee(result.profit)} tone={result.profit < 0 ? "bad" : "ok"} />
          <SummaryRow
            label="PER PC PROFIT"
            hint={a.profitPctAddsValueLossPct ? "profit % = per-pc profit × 100 ÷ ORDER rate + % value loss (this sheet's variant)" : "profit % = per-pc profit × 100 ÷ ORDER rate"}
            value={result.perPcProfit === null ? "—" : rupee(result.perPcProfit)}
            extra={<Badge tone={result.profitPct !== null && result.profitPct < 0 ? "bad" : "ok"}>profit % {pct(result.profitPct)}</Badge>}
            tone={result.perPcProfit !== null && result.perPcProfit < 0 ? "bad" : "ok"}
          />

          {/* REJECT */}
          <SectionHeader label="REJECT" count={doc.lines.filter((l) => l.sectionKey === "REJECT" && !l.removed).length} collapsed={!!collapsed.REJECT} onToggle={() => toggle("REJECT")} accent="actual" span={3} trail={1} note="Total Value Loss" cells={[<span key="t" className="font-semibold text-ink">{money(result.totalValueLoss)}</span>]} />
          {!collapsed.REJECT &&
            doc.lines
              .filter((l) => l.sectionKey === "REJECT" && (showRemoved || !l.removed))
              .map((l) => <ActualRow key={l.id} line={l} total={result.lineTotals[l.id] ?? 0} setF={setF} revert={revert} edit={edit} issues={lineIssues(issues, l.id)} readOnly={readOnly} />)}
          <SummaryRow label="% value loss" hint="Total Value Loss ÷ Total Cost × 100" value={pct(result.valueLossPct)} />
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ label, hint, value, strong, tone, extra }: { label: string; hint?: string; value: string; strong?: boolean; tone?: "ok" | "bad"; extra?: React.ReactNode }) {
  return (
    <tr className={cn("border-t border-line", strong && "bg-accent-soft/50")}>
      <td colSpan={3} className="px-4 py-1.5">
        <div className="flex items-center gap-2">
          <span className={cn("text-[12px] font-semibold uppercase tracking-[0.05em]", strong ? "text-ink" : "text-ink-2")}>{label}</span>
          {hint && <span className="truncate text-[11px] text-ink-3">{hint}</span>}
        </div>
      </td>
      <td className="px-1.5 py-1.5 text-right">
        <div className="flex items-center justify-end gap-2">
          {extra}
          <span className={cn("num text-[13px]", strong ? "font-bold text-ink" : "font-semibold", tone === "ok" && "text-ok", tone === "bad" && "text-bad")}>{value}</span>
        </div>
      </td>
      <td />
    </tr>
  );
}

function ActualRow({ line: l, total, setF, revert, edit, issues, readOnly }: { line: CostLine; total: number; setF: (id: string, f: LineField, v: number | string | null) => void; revert: (id: string, f: LineField) => void; edit: Edit<ActualCosting>; issues: ValidationIssue[]; readOnly?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const removed = !!l.removed;
  const isAmount = l.calc === "ENTERED_AMOUNT";
  return (
    <>
      <tr className={cn("group border-t border-line/70 hover:bg-[#f7f9fc]", removed && "opacity-50")}>
        <td className="py-0.5 pl-3 pr-1">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setOpen((o) => !o)} className="rounded p-0.5 text-ink-3 hover:bg-black/5" aria-label="Details">
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {l.custom || !l.item ? (
              <TextCell value={l.item} onCommit={(v) => setF(l.id, "item", v)} disabled={readOnly || removed} placeholder="Component name" className={cn("font-medium", removed && "line-through")} />
            ) : (
              <span className={cn("truncate px-1.5 font-medium", removed && "line-through")} title={l.item}>
                {l.item}
              </span>
            )}
            {l.custom && <Badge tone="accent">NEW</Badge>}
            <IssueMark issues={issues} />
          </div>
        </td>
        <td className="px-1">
          {isAmount ? (
            <span className="block px-1.5 text-right text-[11px] text-ink-3">amount</span>
          ) : (
            <div className="flex items-center gap-0.5">
              <NumberCell value={l.quantity} onCommit={(v) => setF(l.id, "quantity", v)} disabled={readOnly || removed} ariaLabel={`${l.item} quantity`} />
            </div>
          )}
        </td>
        <td className="px-1">
          {isAmount ? null : <NumberCell value={l.rate} onCommit={(v) => setF(l.id, "rate", v)} disabled={readOnly || removed} ariaLabel={`${l.item} rate`} />}
        </td>
        <td className="px-1">
          {isAmount ? (
            <NumberCell value={l.amount ?? null} onCommit={(v) => setF(l.id, "amount", v)} disabled={readOnly || removed} ariaLabel={`${l.item} amount`} />
          ) : (
            <div className="num px-1.5 text-right font-medium">{removed ? "—" : money(total)}</div>
          )}
        </td>
        <td className="pr-2">
          <div className="flex items-center justify-end gap-0.5">
            {!isAmount && (
              <>
                <ProvTag prov={l.prov.quantity} value={l.quantity} label={`${l.item} · ${FIELD_COLUMN.quantity}`} onRevert={() => revert(l.id, "quantity")} />
                <ProvTag prov={l.prov.rate} value={l.rate} label={`${l.item} · ${FIELD_COLUMN.rate}`} onRevert={() => revert(l.id, "rate")} />
              </>
            )}
            {isAmount && <ProvTag prov={l.prov.amount} value={l.amount} label={`${l.item} · amount`} onRevert={() => revert(l.id, "amount")} />}
            {!readOnly &&
              (removed ? (
                <Tip content="Restore line">
                  <button onClick={() => edit((d) => restoreLine(d, l.id))} className="rounded p-1 text-ink-3 hover:bg-black/5" aria-label="Restore">
                    <RotateCw size={12} />
                  </button>
                </Tip>
              ) : (
                <Tip content={l.custom ? "Remove line" : "Remove line (kept in history, excluded from totals)"}>
                  <button onClick={() => edit((d) => removeLine(d, l.id))} className="rounded p-1 text-ink-3 opacity-0 hover:bg-bad-soft hover:text-bad focus:opacity-100 group-hover:opacity-100" aria-label="Remove">
                    <Trash2 size={12} />
                  </button>
                </Tip>
              ))}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-2/70">
          <td colSpan={5} className="px-9 py-2">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-20 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Description</span>
                <TextCell value={l.description} onCommit={(v) => setF(l.id, "description", v)} disabled={readOnly} placeholder="Optional note for this component" className="max-w-[460px] border-line bg-white" />
              </div>
              <div className="text-[11px] text-ink-3">
                {l.sourceRef && <span>{refText(l.sourceRef)}</span>}
                {l.sourceFormula && <span className="ml-2 font-mono">{l.sourceFormula}</span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ───────────── CLIENT ───────────── */

const ATTRS: Array<{ key: string; label: string; wide?: boolean }> = [
  { key: "hsCode", label: "HS Code" },
  { key: "duty", label: "Duty %" },
  { key: "fabricType", label: "Fabric Type" },
  { key: "fabricFinish", label: "Fabric Finish" },
  { key: "construction", label: "Fabric Construction & Content W/ Percentage", wide: true },
  { key: "knitGauge", label: "Knit Gauge" },
  { key: "cuttableWidth", label: "Cuttable Width" },
  { key: "source", label: "Source" },
  { key: "costingScenario", label: "Costing Scenario" },
  { key: "action", label: "Action" },
];

export function ClientTable({ doc, result, edit, issues, uoms, readOnly, showRemoved }: BaseProps & { doc: ClientCosting; result: ClientResult; edit: Edit<ClientCosting> }) {
  const { collapsed, toggle } = useCollapsed();
  const by = getUserName();
  const setF = (id: string, f: LineField, v: number | string | null) => edit((d) => setLineField(d, id, f, v, { by }));
  const revert = (id: string, f: LineField) => edit((d) => revertOverride(d, id, f));
  const setAttr = (id: string, key: string, v: string) => edit((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, attributes: { ...l.attributes, [key]: v === "" ? null : v } } : l)) }));

  const allSections = [...doc.client.sections];
  for (const l of doc.lines) if (!allSections.find((s) => s.key === l.sectionKey)) allSections.push({ key: l.sectionKey, label: l.sectionLabel, phase: "MAIN" });
  const main = allSections.filter((s) => s.phase === "MAIN");
  const post = allSections.filter((s) => s.phase === "POST_TOTAL");

  const renderSection = (s: (typeof allSections)[number]) => {
    const lines = doc.lines.filter((l) => l.sectionKey === s.key && (showRemoved || !l.removed));
    const t = result.sections.find((x) => x.key === s.key);
    const isCollapsed = collapsed[s.key];
    const live = lines.filter((l) => !l.removed).length;
    return (
      <React.Fragment key={s.key}>
        <SectionHeader label={s.label} count={live} collapsed={!!isCollapsed} onToggle={() => toggle(s.key)} accent="client" span={6} trail={2} cells={[<span key="b" className="font-semibold text-ink">{money(t?.total ?? 0)}</span>, <span key="g" className="text-ink-2">{money(t?.gst ?? 0)}</span>, <span key="w" className="text-ink-2">{money(t?.withGst ?? 0)}</span>]} />
        {!isCollapsed && lines.map((l) => <ClientRow key={l.id} line={l} res={result.lineResults[l.id]} setF={setF} revert={revert} setAttr={setAttr} edit={edit} issues={lineIssues(issues, l.id)} readOnly={readOnly} />)}
        {!isCollapsed && !readOnly && <AddComponent colSpan={11} onAdd={(name) => edit((d) => addLine(d, newLine(s.key, s.label, name, "QTY_X_RATE", d.currency)))} />}
      </React.Fragment>
    );
  };

  return (
    <div className="overflow-x-auto">
      <datalist id="uom-list">{uoms.map((u) => <option key={u} value={u} />)}</datalist>
      {doc.client.headerNotes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Product notes</span>
          {doc.client.headerNotes.map((n, i) => (
            <Badge key={i} tone="neutral" title="Memo text from the Product ID column of the source sheet">
              {n}
            </Badge>
          ))}
        </div>
      )}
      <table className="w-full min-w-[900px] table-fixed text-[12.5px]">
        <colgroup>
          <col className="w-[220px]" />
          <col className="w-[40px]" />
          <col className="w-[78px]" />
          <col className="w-[76px]" />
          <col className="w-[84px]" />
          <col className="w-[62px]" />
          <col className="w-[84px]" />
          <col className="w-[76px]" />
          <col className="w-[84px]" />
          <col className="w-[86px]" />
          <col className="w-[52px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <th className={cn(th, "pl-4 text-left")}>Cost Item</th>
            <th className={cn(th, "text-center")} title="Item Type (source code)">Type</th>
            <th className={cn(th, "text-right")}>Quantity</th>
            <th className={cn(th, "text-left")}>UOM</th>
            <th className={cn(th, "text-right")} title="Price without GST">Price w/o GST</th>
            <th className={cn(th, "text-right")}>GST</th>
            <th className={cn(th, "text-right")} title="Base Total (W/o GST Factor)">Base Total</th>
            <th className={cn(th, "text-right")} title="Input Cost (on Base cost w/o GST factor)">Input Cost</th>
            <th className={cn(th, "text-right")} title="Base Total (With GST)">With GST</th>
            <th className={cn(th, "text-center")}>Src</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {main.map(renderSection)}
          <TotalRow label="Total" hint="Σ of the categories above" r={result.total} />
          {post.map(renderSection)}
          <TotalRow label="Total Cost" hint="Total + Testing + Garment Rejection + Overhead+Margin" r={result.totalCost} strong />
        </tbody>
      </table>
      <PriceChain doc={doc} result={result} edit={edit} readOnly={readOnly} />
    </div>
  );
}

function TotalRow({ label, hint, r, strong }: { label: string; hint: string; r: { base: number; gst: number; withGst: number }; strong?: boolean }) {
  return (
    <tr className={cn("border-t-2 border-line-strong", strong ? "bg-accent-soft/70" : "bg-surface-2")}>
      <td colSpan={6} className="px-4 py-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink">{label}</span>
        <span className="ml-2 text-[11px] text-ink-3">{hint}</span>
      </td>
      <td className="num px-1.5 text-right text-[13px] font-bold">{money(r.base)}</td>
      <td className="num px-1.5 text-right text-ink-2">{money(r.gst)}</td>
      <td className="num px-1.5 text-right font-semibold">{money(r.withGst)}</td>
      <td colSpan={2} />
    </tr>
  );
}

function PriceChain({ doc, result, edit, readOnly }: { doc: ClientCosting; result: ClientResult; edit: Edit<ClientCosting>; readOnly?: boolean }) {
  const f = doc.client.finance;
  const by = getUserName();
  return (
    <div className="border-t border-line bg-surface px-4 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Price build-up</div>
      <div className="grid max-w-[640px] grid-cols-[1fr_120px_120px] items-center gap-x-3 gap-y-1 text-[12.5px]">
        <div className="font-medium">FOB Price</div>
        <div />
        <div className="num text-right font-semibold">{rupee(result.fobPrice)}</div>

        <div className="flex items-center gap-1.5">
          <span className="font-medium">FINANCE COST</span>
          {f.referenceRate !== null && (
            <Tip content={<div>The source label reads “FINANCE COST {(f.referenceRate * 100).toFixed(0)}%” but its formula multiplies FOB by {f.prov ? "the factor shown" : "0"}. The factor is an input here; it is never applied silently.{f.note ? <div className="mt-1 font-mono text-[11px]">{f.note}</div> : null}</div>}>
              <span className="cursor-help rounded bg-warn-soft px-1 text-[10px] font-bold text-warn">label {(f.referenceRate * 100).toFixed(0)}% · applied {(f.rate * 100).toFixed(2).replace(/\.00$/, "")}%</span>
            </Tip>
          )}
        </div>
        <div>
          <NumberCell value={f.rate} scale={100} suffix="%" decimals={4} disabled={readOnly} ariaLabel="Finance cost rate" onCommit={(v) => edit((d) => ({ ...d, client: { ...d.client, finance: { ...d.client.finance, rate: v ?? 0, prov: { origin: "MANUAL", at: new Date().toISOString(), by } } } }))} />
        </div>
        <div className="num text-right">{rupee(result.financeCost)}</div>

        <div className="font-medium">FINAL PO PRICE <span className="font-normal text-ink-3">(FOB − finance cost)</span></div>
        <div />
        <div className="num text-right font-semibold">{rupee(result.finalPoPrice)}</div>

        <div className="font-medium">Transport</div>
        <div>
          <NumberCell value={doc.client.transport.amount} disabled={readOnly} ariaLabel="Transport" onCommit={(v) => edit((d) => ({ ...d, client: { ...d.client, transport: { amount: v ?? 0, prov: { origin: "MANUAL", at: new Date().toISOString(), by } } } }))} />
        </div>
        <div className="num text-right">{rupee(result.transport)}</div>

        <div className="col-span-3 mt-1 border-t border-line-strong" />
        <div className="text-[13px] font-bold uppercase tracking-[0.04em]">FINAL PO PRICE Incl Transport</div>
        <div />
        <div className="num text-right text-[15px] font-bold text-client">{rupee(result.finalPoPriceInclTransport)}</div>
      </div>
    </div>
  );
}

function ClientRow({ line: l, res, setF, revert, setAttr, edit, issues, readOnly }: { line: CostLine; res?: { base: number; gst: number; withGst: number }; setF: (id: string, f: LineField, v: number | string | null) => void; revert: (id: string, f: LineField) => void; setAttr: (id: string, k: string, v: string) => void; edit: Edit<ClientCosting>; issues: ValidationIssue[]; readOnly?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const removed = !!l.removed;
  const isPct = l.calc === "PERCENT_OF_SUBTOTAL";
  const name = l.item || l.description || l.sectionLabel;
  const dis = readOnly || removed;
  return (
    <>
      <tr className={cn("group border-t border-line/70 hover:bg-[#f7f9fc]", removed && "opacity-50")}>
        <td className="py-0.5 pl-3 pr-1">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setOpen((o) => !o)} className="rounded p-0.5 text-ink-3 hover:bg-black/5" aria-label="Show attributes" aria-expanded={open}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            <div className="min-w-0 flex-1">
              {l.custom || !l.item ? (
                <TextCell value={l.item} onCommit={(v) => setF(l.id, "item", v)} disabled={dis} placeholder={l.description || "Cost item"} className={cn("font-medium", removed && "line-through")} />
              ) : (
                <div className={cn("truncate px-1.5 font-medium leading-tight", removed && "line-through")} title={l.item}>
                  {l.item}
                </div>
              )}
              {l.description && !open && <div className="truncate px-1.5 text-[11px] leading-tight text-ink-3" title={l.description}>{l.description}</div>}
            </div>
            {l.custom && <Badge tone="accent">NEW</Badge>}
            <IssueMark issues={issues} />
          </div>
        </td>
        <td className="px-1 text-center text-[11px] font-semibold text-ink-3">{l.itemType ?? ""}</td>
        <td className="px-1">
          {isPct ? (
            <Tip content="Quantity is not used: this line is a % of Total (source formula L = Total × price)."><span className="block px-1.5 text-right text-ink-3">—</span></Tip>
          ) : (
            <NumberCell value={l.quantity} onCommit={(v) => setF(l.id, "quantity", v)} disabled={dis} ariaLabel={`${name} quantity`} />
          )}
        </td>
        <td className="px-1">{isPct ? null : <TextCell value={l.uom} list="uom-list" onCommit={(v) => setF(l.id, "uom", v === "" ? null : v)} disabled={dis} placeholder="—" ariaLabel={`${name} UOM`} />}</td>
        <td className="px-1">
          {isPct ? (
            <NumberCell value={l.rate} scale={100} suffix="%" onCommit={(v) => setF(l.id, "rate", v)} disabled={dis} ariaLabel={`${name} percent of Total`} />
          ) : (
            <NumberCell value={l.rate} onCommit={(v) => setF(l.id, "rate", v)} disabled={dis} ariaLabel={`${name} price without GST`} />
          )}
        </td>
        <td className="px-1">
          <NumberCell value={l.gstRate} scale={100} suffix="%" decimals={2} onCommit={(v) => setF(l.id, "gstRate", v)} disabled={dis} ariaLabel={`${name} GST`} />
        </td>
        <td className="num px-1.5 text-right font-medium">{removed ? "—" : money(res?.base ?? 0)}</td>
        <td className="num px-1.5 text-right text-ink-2">{removed ? "—" : money(res?.gst ?? 0)}</td>
        <td className="num px-1.5 text-right text-ink-2">{removed ? "—" : money(res?.withGst ?? 0)}</td>
        <td className="text-center">
          <div className="flex items-center justify-center gap-0.5">
            <ProvTag prov={l.prov.quantity} value={l.quantity} unit={l.uom ?? undefined} label={`${name} · ${FIELD_COLUMN.quantity}`} onRevert={() => revert(l.id, "quantity")} />
          </div>
        </td>
        <td className="pr-2">
          <div className="flex items-center justify-end gap-0.5">
            <ProvTag prov={l.prov.rate} value={l.rate} label={`${name} · Price without GST`} onRevert={() => revert(l.id, "rate")} />
            {!readOnly &&
              (removed ? (
                <Tip content="Restore line">
                  <button onClick={() => edit((d) => restoreLine(d, l.id))} className="rounded p-1 text-ink-3 hover:bg-black/5" aria-label="Restore">
                    <RotateCw size={12} />
                  </button>
                </Tip>
              ) : (
                <Tip content={l.custom ? "Remove line" : "Remove line (kept in history, excluded from totals)"}>
                  <button onClick={() => edit((d) => removeLine(d, l.id))} className="rounded p-1 text-ink-3 opacity-0 hover:bg-bad-soft hover:text-bad focus:opacity-100 group-hover:opacity-100" aria-label="Remove">
                    <Trash2 size={12} />
                  </button>
                </Tip>
              ))}
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface-2/70">
          <td colSpan={11} className="px-9 py-3">
            <div className="grid grid-cols-4 gap-x-4 gap-y-2.5">
              <Attr label="Description" wide>
                <TextCell value={l.description} onCommit={(v) => setF(l.id, "description", v)} disabled={readOnly} className="border-line bg-white" />
              </Attr>
              <Attr label="Item Type">
                <TextCell value={l.itemType} onCommit={(v) => edit((d) => ({ ...d, lines: d.lines.map((x) => (x.id === l.id ? { ...x, itemType: v || null } : x)) }))} disabled={readOnly} className="border-line bg-white" />
              </Attr>
              <Attr label="Currency">
                <TextCell value={l.currency} onCommit={(v) => edit((d) => ({ ...d, lines: d.lines.map((x) => (x.id === l.id ? { ...x, currency: v || "INR" } : x)) }))} disabled={readOnly} className="border-line bg-white" />
              </Attr>
              {ATTRS.map((a) => (
                <Attr key={a.key} label={a.label} wide={a.wide}>
                  <TextCell value={l.attributes[a.key] === null || l.attributes[a.key] === undefined ? "" : String(l.attributes[a.key])} onCommit={(v) => setAttr(l.id, a.key, v)} disabled={readOnly} className="border-line bg-white" />
                </Attr>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
              {l.sourceRef && <span>{refText(l.sourceRef)}</span>}
              {l.sourceFormula && <span className="font-mono">Base Total: {l.sourceFormula}</span>}
              <span className="flex items-center gap-1">
                <SourceMark line={l} />
              </span>
              {l.prov.quantity?.at && <span>Quantity set {dateTime(l.prov.quantity.at)}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Attr({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cn("block", wide && "col-span-2")}>
      <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </label>
  );
}
