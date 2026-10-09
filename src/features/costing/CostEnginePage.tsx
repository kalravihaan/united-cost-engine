"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "./api";
import { Download, FileSpreadsheet, FileText, Save, Undo2, History as HistoryIcon, Eye, EyeOff, Layers } from "lucide-react";
import type { ActualCosting, ClientCosting, CostingDoc } from "@/types/costing";
import { applyCadToCosting, diffCostings } from "@/lib/calculations";
import { cn, dateTime, rupee } from "@/lib/format";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Dialog, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { StylePanel } from "@/features/styles/StylePanel";
import { CadPanel } from "@/features/cad/CadPanel";
import { ComparisonPanel } from "@/features/comparison/ComparisonPanel";
import { BenchmarksPanel } from "@/features/analysis/BenchmarksPanel";
import { ActualTable, ClientTable } from "./CostingTable";
import { AuditPanel, ChainPanel, ChecksPanel, VersionsPanel } from "./panels";
import { WorkflowBar } from "./WorkflowBar";
import { useWorkspace, type CostingType, type Workbench } from "./useWorkspace";
import { getUserName } from "./user";

export function CostEnginePage() {
  const wb = useWorkspace();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [mode, setMode] = React.useState<CostingType>("CLIENT");
  const [tab, setTab] = React.useState("costing");
  const [showRemoved, setShowRemoved] = React.useState(false);
  const [uoms, setUoms] = React.useState<string[]>([]);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [versionKey, setVersionKey] = React.useState(0);
  const loadedFromUrl = React.useRef(false);

  React.useEffect(() => {
    api.masterList("uoms").then((r) => setUoms((r as Array<{ code: string }>).map((x) => x.code))).catch(() => {});
  }, []);

  // deep link: /?style=<id>&mode=ACTUAL
  React.useEffect(() => {
    if (loadedFromUrl.current) return;
    loadedFromUrl.current = true;
    const id = sp.get("style");
    const m = sp.get("mode");
    if (m === "ACTUAL" || m === "CLIENT") setMode(m);
    if (id) wb.loadStyle(id);
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const styleId = wb.ws?.style.id ?? null;
  React.useEffect(() => {
    const cur = sp.get("style");
    if (styleId && cur !== styleId) router.replace(`/?style=${styleId}&mode=${mode}`, { scroll: false });
  }, [styleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // when a style loads, open the mode that has a costing
  React.useEffect(() => {
    if (!wb.ws) return;
    if (!wb.drafts[mode]) {
      const other: CostingType = mode === "ACTUAL" ? "CLIENT" : "ACTUAL";
      if (wb.drafts[other]) setMode(other);
    }
  }, [wb.ws?.style.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const doc = wb.drafts[mode];
  const result = wb.results[mode];
  const issues = React.useMemo(() => wb.validate(mode), [wb.validate, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const version = wb.loadedVersion[mode];
  const isDirty = wb.dirty[mode] > 0;
  const stored = mode === "ACTUAL" ? wb.ws?.actual : wb.ws?.client;

  /* CAD → costing dry run for the preview */
  const applyPreview = React.useMemo(() => {
    if (!doc || !wb.cad || !wb.rules) return [];
    const out = applyCadToCosting(doc, wb.cad, wb.rules.cadMappingRules);
    return out.applied.flatMap((a) => {
      const before =
        doc.type === "ACTUAL" && a.target === "Consumption"
          ? `${doc.actual.consumption.value ?? "—"} m`
          : (() => {
              const l = doc.lines.find((x) => x.id === a.lineId);
              return `${l?.quantity ?? "—"} ${l?.uom ?? ""}`.trim();
            })();
      // already carrying exactly this CAD value → nothing left to apply
      if (parseFloat(before) === a.value) return [];
      return [{ target: a.target, from: before, to: `${a.value} ${a.unit}` }];
    });
  }, [doc, wb.cad, wb.rules]);

  const changes = React.useMemo(() => (doc && stored ? diffCostings(stored.doc as CostingDoc, doc) : []), [doc, stored]);

  const doSave = async (note: string) => {
    try {
      const r = await wb.save(mode, note || undefined);
      setSaveOpen(false);
      setVersionKey((k) => k + 1);
      toast.push(r.unchanged ? { kind: "info", title: "No changes to save" } : { kind: "ok", title: `Saved ${mode === "ACTUAL" ? "Actual" : "Client"} costing v${r.version.versionNo}`, body: "A new immutable version was created; earlier versions are untouched." });
    } catch (e) {
      toast.push({ kind: "error", title: "Save failed", body: (e as Error).message });
    }
  };

  const doApplyCad = () => {
    const out = wb.applyCad(mode);
    if (!out) return;
    if (out.applied.length) toast.push({ kind: "ok", title: "CAD applied", body: out.applied.map((a) => `${a.target} → ${a.value} ${a.unit}`).join("\n") });
    if (out.skipped.length) toast.push({ kind: "warn", title: "Some CAD rules were not applied", body: out.skipped.map((s) => s.reason).join("\n") });
  };

  const exportDoc = async (format: "pdf" | "xlsx") => {
    if (!doc || !wb.ws) return;
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user": getUserName() },
        body: JSON.stringify({ styleId: wb.ws.style.id, doc, format, versionNo: version?.versionNo ?? null, unsaved: isDirty, otherDoc: wb.drafts[mode === "ACTUAL" ? "CLIENT" : "ACTUAL"] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${wb.ws.style.number}_${mode === "ACTUAL" ? "actual" : "client"}_costing.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.push({ kind: "error", title: "Export failed", body: (e as Error).message });
    }
  };

  return (
    <div className="space-y-4">
      <WorkflowBar wb={wb} mode={mode} setMode={setMode} />
      {wb.error && <div className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[12.5px] text-bad">{wb.error}</div>}

      <div className="grid grid-cols-[372px_minmax(0,1fr)] items-start gap-4">
        <aside className="space-y-4">
          <StylePanel styleId={styleId} styleNumber={wb.ws?.style.number} imageUrl={wb.ws?.imageUrl ?? null} onChanged={() => wb.refresh(true)} />
          <CadPanel ws={wb.ws} enteredStyle={wb.ws?.style.number ?? ""} onChanged={() => wb.refresh(true)} onApply={doApplyCad} applyPreview={applyPreview} canApply={!!doc} />
        </aside>

        <div className="min-w-0 space-y-4">
          <SummaryStrip wb={wb} mode={mode} />

          <Card className="overflow-hidden">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="costing">Costing</TabsTrigger>
                <TabsTrigger value="comparison">Comparison</TabsTrigger>
                <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
                <TabsTrigger value="chain">Calculation</TabsTrigger>
                <TabsTrigger value="checks" count={issues.filter((i) => i.level !== "info").length}>Checks</TabsTrigger>
                <TabsTrigger value="versions">Versions</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>

              <TabsContent value="costing" className="outline-none">
                {!wb.ws ? (
                  <div className="p-4">{wb.loading ? <TableSkeleton /> : <EmptyState title="Enter a style number to begin" icon={<Layers size={24} />}>Create the style, add its image, upload the CAD, then enter the costing. Each mode opens with all of its standard headers and rows; remove the ones this style does not need. CAD consumption feeds the fabric lines.</EmptyState>}</div>
                ) : !doc ? (
                  <div className="p-4">
                    {wb.templates === null ? (
                      <TableSkeleton />
                    ) : (
                      <EmptyState title={`No default ${mode === "ACTUAL" ? "Actual" : "Client"} template yet`} icon={<Layers size={24} />}>
                        Each costing mode starts with all of its headers and rows. <Link href="/templates" className="font-medium text-accent hover:underline">Set up the default templates</Link> and this costing will open ready for entry.
                      </EmptyState>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/60 px-4 py-2">
                      <div className="flex items-center gap-2 text-[12px] text-ink-2">
                        <Badge tone={mode === "ACTUAL" ? "actual" : "client"}>{mode === "ACTUAL" ? "ACTUAL COSTING" : "CLIENT COSTING"}</Badge>
                        {doc.type === "CLIENT" && doc.client.format && (
                          !stored && wb.clientFormats.length > 1 ? (
                            <label className="flex items-center gap-1 text-[11.5px] text-ink-3">
                              Layout
                              <select
                                className="rounded border border-line bg-white px-1.5 py-0.5 text-[12px] font-medium text-ink"
                                value={wb.clientFormat}
                                aria-label="Client costing layout"
                                onChange={(e) => {
                                  if (wb.dirty.CLIENT > 1 && !window.confirm("Switching the layout starts this client costing again from that layout's rows. Entries made so far will be lost.")) return;
                                  wb.setClientFormat(e.target.value);
                                }}
                              >
                                {wb.clientFormats.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                              </select>
                            </label>
                          ) : (
                            <Badge tone="neutral">{doc.client.format.label}</Badge>
                          )
                        )}
                        <span className="font-semibold text-ink">{doc.style.label || doc.style.number}</span>
                        {version ? (
                          <span>
                            {version.historic ? <Badge tone="warn">Viewing v{version.versionNo} (historic)</Badge> : <>v{version.versionNo}</>}
                            {stored && !version.historic && <span className="text-ink-3"> · {dateTime(stored.createdAt)} · {stored.createdBy}</span>}
                          </span>
                        ) : (
                          <Badge tone="warn">New costing · not saved yet</Badge>
                        )}
                        {isDirty && version && <Badge tone="warn">{changes.length || wb.dirty[mode]} unsaved change{(changes.length || wb.dirty[mode]) === 1 ? "" : "s"}</Badge>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setShowRemoved((s) => !s)}>{showRemoved ? <EyeOff size={13} /> : <Eye size={13} />} {showRemoved ? "Hide" : "Show"} removed</Button>
                        <Button size="sm" variant="outline" disabled={!isDirty && !version?.historic} onClick={() => wb.discard(mode)}><Undo2 size={13} /> {version?.historic ? "Back to latest" : version ? "Discard" : "Start over"}</Button>
                        <ExportMenu onExport={exportDoc} />
                        <Button size="sm" variant="primary" disabled={!isDirty && !version?.historic} onClick={() => setSaveOpen(true)}><Save size={13} /> {version ? "Save version" : "Save as v1"}</Button>
                      </div>
                    </div>
                    {doc.type === "ACTUAL" && result?.type === "ACTUAL" ? (
                      <ActualTable doc={doc} result={result} edit={(fn) => wb.edit<ActualCosting>("ACTUAL", fn)} issues={issues} uoms={uoms} showRemoved={showRemoved} />
                    ) : doc.type === "CLIENT" && result?.type === "CLIENT" ? (
                      <ClientTable doc={doc} result={result} edit={(fn) => wb.edit<ClientCosting>("CLIENT", fn)} issues={issues} uoms={uoms} showRemoved={showRemoved} />
                    ) : null}
                  </>
                )}
              </TabsContent>

              <TabsContent value="comparison" className="outline-none">
                {wb.ws ? (
                  <ComparisonPanel cmp={wb.comparison} styleNumber={wb.ws.style.number} actualEmpty={(wb.results.ACTUAL?.totalCost ?? 0) === 0} clientEmpty={(wb.results.CLIENT?.totalCost.base ?? 0) === 0} />
                ) : (
                  <EmptyState title="Select a style" />
                )}
              </TabsContent>

              <TabsContent value="benchmarks" className="outline-none">
                {wb.ws ? (
                  <BenchmarksPanel styleNumber={wb.ws.style.number} brand={wb.ws.style.brand} clientFormat={wb.clientFormat} doc={(wb.drafts.ACTUAL as ActualCosting | undefined) ?? null} result={wb.results.ACTUAL ?? null} rules={wb.rules} />
                ) : (
                  <EmptyState title="Select a style" />
                )}
              </TabsContent>

              <TabsContent value="chain" className="outline-none">
                {doc && result ? <ChainPanel doc={doc} result={result} /> : <EmptyState title="No costing open" />}
              </TabsContent>

              <TabsContent value="checks" className="outline-none">
                <ChecksPanel issues={issues} />
              </TabsContent>

              <TabsContent value="versions" className="outline-none">
                {wb.ws ? (
                  <VersionsPanel styleId={wb.ws.style.id} type={mode} currentVersionNo={stored?.versionNo} historicId={version?.historic ? version.id : undefined} refreshKey={versionKey} onOpen={async (id) => { await wb.loadHistoric(id); setTab("costing"); toast.push({ kind: "info", title: "Historic version opened", body: "Saving will create a new version; the old one is never changed." }); }} />
                ) : (
                  <EmptyState title="Select a style" icon={<HistoryIcon size={22} />} />
                )}
              </TabsContent>

              <TabsContent value="audit" className="outline-none">{wb.ws ? <AuditPanel styleId={wb.ws.style.id} refreshKey={versionKey} /> : <EmptyState title="Select a style" />}</TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>

      <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} changes={changes} historic={!!version?.historic} versionNo={stored?.versionNo} onSave={doSave} type={mode} />
    </div>
  );
}

/* ───────────── sticky summary ───────────── */
function SummaryStrip({ wb, mode }: { wb: Workbench; mode: CostingType }) {
  const a = wb.results.ACTUAL;
  const c = wb.results.CLIENT;
  const touched = (t: CostingType) => wb.drafts[t]?.lines.some((l) => (l.quantity ?? 0) !== 0 || (l.rate ?? 0) !== 0 || (l.amount ?? 0) !== 0);
  const actualPc = a && touched("ACTUAL") ? a.costPerPc : null;
  const clientPc = c && touched("CLIENT") ? c.totalCost.base : null;
  const diff = actualPc !== null && clientPc !== null ? clientPc - actualPc : null;
  const premium = diff !== null && actualPc ? (diff * 100) / actualPc : null;
  return (
    <div className="sticky top-[60px] z-20">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 rounded-lg border border-line bg-surface/95 p-3 shadow-[0_4px_16px_-8px_rgba(16,24,40,0.18)] backdrop-blur">
        <Stat label="Actual cost / pc" value={rupee(actualPc)} tone="actual" active={mode === "ACTUAL"} sub={!wb.ws ? "—" : a && touched("ACTUAL") ? `Total cost ${rupee(a.totalCost)} · profit ${rupee(a.perPcProfit)} / pc` : "Enter quantities and rates"} />
        <Stat label="Client cost / pc" value={rupee(clientPc)} tone="client" active={mode === "CLIENT"} sub={!wb.ws ? "—" : c && touched("CLIENT") ? `${wb.drafts.CLIENT?.type === "CLIENT" && wb.drafts.CLIENT.client.pricing && !wb.drafts.CLIENT.client.pricing.transport ? wb.drafts.CLIENT.client.pricing.finalPriceLabel : "Final PO incl. transport"} ${rupee(c.finalPoPriceInclTransport)}` : "Enter quantities and rates"} />
        <Stat label="Difference / pc" value={diff === null ? "—" : rupee(diff, { sign: true })} sub={diff === null ? (wb.ws ? "Appears once both costings have values" : "—") : `Client premium ${premium === null ? "—" : premium.toFixed(2) + "%"}`} />
        <div className="flex min-w-[120px] flex-col items-end justify-center text-right">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">Checks</div>
          <div className="mt-0.5 flex items-center gap-1">{wb.ws ? <ChecksBadge issues={wb.validate(mode)} /> : <span className="text-ink-3">—</span>}</div>
        </div>
      </div>
    </div>
  );
}

function ChecksBadge({ issues }: { issues: ReturnType<Workbench["validate"]> }) {
  const e = issues.filter((i) => i.level === "error").length;
  const w = issues.filter((i) => i.level === "warning").length;
  if (!e && !w) return <Badge tone="ok">ALL CLEAR</Badge>;
  return (
    <>
      {e > 0 && <Badge tone="bad">{e} error{e > 1 ? "s" : ""}</Badge>}
      {w > 0 && <Badge tone="warn">{w} warning{w > 1 ? "s" : ""}</Badge>}
    </>
  );
}

function Stat({ label, value, sub, tone, active }: { label: string; value: string; sub?: string; tone?: "actual" | "client"; active?: boolean }) {
  return (
    <div className={cn("rounded-md px-3 py-1.5", active && (tone === "actual" ? "bg-actual-soft" : "bg-client-soft"))}>
      <div className={cn("text-[10.5px] font-semibold uppercase tracking-[0.07em]", tone === "actual" ? "text-actual" : tone === "client" ? "text-client" : "text-ink-3")}>{label}</div>
      <div className="num text-[22px] font-bold leading-tight text-ink">{value}</div>
      <div className="num truncate text-[11px] text-ink-3" title={sub}>{sub}</div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-7" />
      ))}
    </div>
  );
}

function ExportMenu({ onExport }: { onExport: (f: "pdf" | "xlsx") => void }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}><Download size={13} /> Export</Button>
      {open && (
        <div role="menu" className="fade-in absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-line bg-surface p-1 shadow-xl">
          <button role="menuitem" onClick={() => { setOpen(false); onExport("pdf"); }} className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface-2"><FileText size={14} /> PDF</button>
          <button role="menuitem" onClick={() => { setOpen(false); onExport("xlsx"); }} className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12.5px] hover:bg-surface-2"><FileSpreadsheet size={14} /> Excel (with formulas)</button>
        </div>
      )}
    </div>
  );
}

function SaveDialog({ open, onOpenChange, changes, historic, versionNo, onSave, type }: { open: boolean; onOpenChange: (o: boolean) => void; changes: ReturnType<typeof diffCostings>; historic: boolean; versionNo?: number; onSave: (note: string) => Promise<void>; type: CostingType }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Save ${type === "ACTUAL" ? "Actual" : "Client"} costing as a new version`} description={`Creates v${(versionNo ?? 0) + 1}. Earlier versions are never overwritten.${historic ? " You are saving from a historic version." : ""}`} width="max-w-xl">
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Changed fields ({changes.length})</div>
          <ul className="max-h-56 space-y-0.5 overflow-auto rounded-md border border-line p-2 text-[12px]">
            {changes.length === 0 && <li className="text-ink-3">No field-level differences from the latest version.</li>}
            {changes.slice(0, 60).map((c, i) => (
              <li key={i}><span className="font-mono text-[11px] text-ink-2">{c.path}</span>: <span className="num text-ink-3">{String(c.before ?? "∅")}</span> → <span className="num font-semibold">{String(c.after ?? "∅")}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Note (optional)</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Why was this changed?" className="w-full rounded-md border border-line-strong p-2 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); await onSave(note); setBusy(false); setNote(""); }}>Save version</Button>
        </div>
      </div>
    </Dialog>
  );
}
