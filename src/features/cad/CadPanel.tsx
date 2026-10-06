"use client";
import * as React from "react";
import { AlertTriangle, Check, FileText, Pencil, RefreshCw, X, ArrowRight } from "lucide-react";
import type { CadData, CadField } from "@/types/costing";
import { cadEffective, cadUsable } from "@/lib/calculations";
import { cadStyleMatches } from "@/lib/normalization/styleMatching";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui/primitives";
import { FileDrop } from "@/components/ui/filedrop";
import { Tip } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import { api, type Workspace } from "@/features/costing/api";

type Row = { key: string; label: string; field: CadField<number | string>; fmt: (v: number | string) => string; editable?: boolean };

const trim = (v: number | string, unit: string, dp = 2) => `${parseFloat(Number(v).toFixed(dp))}${unit}`;

function rowsFor(d: CadData): Row[] {
  return [
    { key: "styleNumber", label: "Style Number", field: d.styleNumber as CadField<number | string>, fmt: (v) => String(v), editable: true },
    { key: "length", label: "Length", field: d.length as CadField<number | string>, fmt: (v) => trim(v, " m"), editable: true },
    { key: "width", label: "Width", field: d.width as CadField<number | string>, fmt: (v) => `${parseFloat(Number(v).toFixed(2))}"`, editable: true },
    { key: "efficiency", label: "Efficiency", field: d.efficiency as CadField<number | string>, fmt: (v) => trim(v, "%"), editable: true },
    { key: "lengthPerSet", label: "Length / Set", field: d.lengthPerSet as CadField<number | string>, fmt: (v) => trim(v, " m"), editable: true },
    { key: "totalPieces", label: "Total Pieces", field: d.totalPieces as CadField<number | string>, fmt: (v) => String(v), editable: true },
    { key: "totalLength", label: "Total Length", field: d.totalLength as CadField<number | string>, fmt: (v) => trim(v, " m"), editable: true },
  ];
}

export function CadPanel({ ws, enteredStyle, onChanged, onApply, applyPreview, canApply }: { ws: Workspace | null; enteredStyle: string; onChanged: (data?: CadData) => void; onApply: () => void; applyPreview: Array<{ target: string; from: string; to: string }>; canApply: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const cad = ws?.cad?.data ?? null;
  const styleId = ws?.style.id ?? null;

  const upload = async (f: File) => {
    if (!styleId) return;
    setBusy(true);
    try {
      const r = await api.uploadCad(styleId, f);
      const bad = (r.data.warnings ?? []).length;
      toast.push({ kind: bad ? "warn" : "ok", title: "CAD extracted", body: bad ? `${bad} item(s) need review – see the warnings under CAD DATA.` : "All values read with high confidence." });
      onChanged(r.data);
    } catch (e) {
      toast.push({ kind: "error", title: "CAD upload failed", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="CAD"
        subtitle={cad ? `Parser ${cad.parserVersion} · ${cad.pageCount} page${cad.pageCount > 1 ? "s" : ""}` : "Upload the CAD / marker PDF"}
        actions={
          cad && styleId ? (
            <label className="inline-flex">
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <span className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-line-strong px-2 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
                <RefreshCw size={12} /> Replace
              </span>
            </label>
          ) : undefined
        }
      />
      <div className="space-y-3 p-3">
        {!cad && (
          <FileDrop accept="application/pdf" onFile={upload} busy={busy} disabled={!styleId} title="Drop the CAD PDF here" hint={styleId ? "Style number, length, width, efficiency and consumption are read from it" : "Select a style first"} />
        )}
        {cad && ws && (
          <>
            {ws.cadPreviewUrl && (
              <a href={ws.cadFileUrl ?? ws.cadPreviewUrl} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-md border border-line bg-white" title="Open the CAD PDF">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ws.cadPreviewUrl} alt="CAD preview" className="aspect-[2.08/1] w-full object-cover object-top" />
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-2 opacity-0 shadow transition-opacity group-hover:opacity-100">
                  <FileText size={11} /> Open PDF
                </span>
              </a>
            )}
            <CadData ws={ws} cad={cad} enteredStyle={enteredStyle} onChanged={onChanged} />
            {cad.warnings.length > 0 && (
              <div className="rounded-md border border-warn/25 bg-warn-soft/60 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-warn">
                  <AlertTriangle size={13} /> Review needed
                </div>
                <ul className="space-y-1 text-[12px] text-ink-2">
                  {cad.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
              {cad.sizeBreakdown.value && (
                <>
                  <span>Sets {cad.sets.value}:</span>
                  {cad.sizeBreakdown.value.map((s) => (
                    <Badge key={s.size} tone="neutral">
                      {s.size}/{s.qty}
                    </Badge>
                  ))}
                </>
              )}
              {cad.pieceNames.map((p) => (
                <Badge key={p} tone="cad">{p}</Badge>
              ))}
            </div>
            <div className="rounded-md border border-line bg-surface-2 p-2.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">CAD → Costing</div>
              {applyPreview.length === 0 ? (
                <div className="text-[12px] text-ink-3">{canApply ? "Nothing left to feed: the CAD value is already in the costing, no line matches, or it needs verification first." : "Open a costing to feed CAD values into it."}</div>
              ) : (
                <ul className="space-y-1">
                  {applyPreview.map((p) => (
                    <li key={p.target} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate text-ink-2">{p.target}</span>
                      <span className="num flex shrink-0 items-center gap-1.5">
                        <span className="text-ink-3">{p.from}</span>
                        <ArrowRight size={11} className="text-ink-3" />
                        <span className="font-semibold text-cad">{p.to}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="primary" size="sm" className="mt-2 w-full" disabled={!canApply || applyPreview.length === 0} onClick={onApply}>
                Apply CAD to costing
              </Button>
              <div className="mt-1.5 text-[11px] text-ink-3">The imported value is kept as the original and can be restored from the line.</div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function CadData({ ws, cad, enteredStyle, onChanged }: { ws: Workspace; cad: CadData; enteredStyle: string; onChanged: (d?: CadData) => void }) {
  const toast = useToast();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const rows = rowsFor(cad);
  const styleMatch = cadStyleMatches(enteredStyle, cadEffective(cad.styleNumber));

  const commit = async (key: string, value: number | string | null) => {
    try {
      const r = await api.editCad(ws.style.id, key, value);
      onChanged(r.data);
      setEditing(null);
      toast.push({ kind: "ok", title: "CAD value recorded", body: "The extracted value is kept; your value is used from now on." });
    } catch (e) {
      toast.push({ kind: "error", title: "Could not save", body: (e as Error).message });
    }
  };

  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">CAD DATA</div>
      <dl className="divide-y divide-line rounded-md border border-line">
        {rows.map((r) => {
          const eff = cadEffective(r.field);
          const manual = !!r.field.manual;
          const verify = r.field.requiresVerification && !manual;
          const missing = eff === null || eff === undefined;
          const isEditing = editing === r.key;
          return (
            <div key={r.key} className={cn("grid grid-cols-[92px_1fr_auto] items-center gap-2 px-2.5 py-1.5", verify && "bg-warn-soft/50", missing && "bg-bad-soft/40")}>
              <dt className="text-[12px] text-ink-2">{r.label}</dt>
              <dd className="min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="h-7" onKeyDown={(e) => { if (e.key === "Enter") commit(r.key, draft === "" ? null : r.key === "styleNumber" ? draft : Number(draft)); if (e.key === "Escape") setEditing(null); }} />
                    <button className="rounded p-1 text-ok hover:bg-ok-soft" aria-label="Save" onClick={() => commit(r.key, draft === "" ? null : r.key === "styleNumber" ? draft : Number(draft))}><Check size={14} /></button>
                    <button className="rounded p-1 text-ink-3 hover:bg-black/5" aria-label="Cancel" onClick={() => setEditing(null)}><X size={14} /></button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("num text-[13px] font-semibold", missing ? "text-bad" : "text-ink")}>{missing ? "not found" : r.fmt(eff as number | string)}</span>
                    {manual && (
                      <Tip content={`Extracted: ${r.field.value === null ? "nothing" : r.fmt(r.field.value as number | string)} · ${r.field.manual?.reason ?? ""}`}>
                        <span className="cursor-help"><Badge tone="accent">{r.field.manual?.value === r.field.value ? "CONFIRMED" : "EDITED"}</Badge></span>
                      </Tip>
                    )}
                    {verify && (
                      <Tip content={<div className="space-y-1">{r.field.notes.map((n, i) => <div key={i}>{n}</div>)}{r.field.notes.length === 0 && <div>Low confidence – please verify.</div>}</div>}>
                        <span className="cursor-help"><Badge tone="warn">VERIFY</Badge></span>
                      </Tip>
                    )}
                    {!verify && !missing && !manual && <Tip content={<div>{r.field.raw}<br />Confidence {(r.field.confidence * 100).toFixed(0)}%{r.field.notes.length ? " · " + r.field.notes.join(" ") : ""}</div>}><span className="cursor-help text-[10.5px] text-ink-3">{(r.field.confidence * 100).toFixed(0)}%</span></Tip>}
                  </div>
                )}
              </dd>
              {!isEditing && (
                <div className="flex items-center gap-0.5">
                  {verify && !missing && (
                    <Tip content="Confirm this value as correct">
                      <button className="rounded p-1 text-ok hover:bg-ok-soft" aria-label={`Confirm ${r.label}`} onClick={() => commit(r.key, eff as number | string)}><Check size={13} /></button>
                    </Tip>
                  )}
                  <Tip content="Edit manually">
                    <button className="rounded p-1 text-ink-3 hover:bg-black/5" aria-label={`Edit ${r.label}`} onClick={() => { setEditing(r.key); setDraft(eff === null || eff === undefined ? "" : String(eff)); }}><Pencil size={12} /></button>
                  </Tip>
                </div>
              )}
            </div>
          );
        })}
      </dl>
      {styleMatch === "MISMATCH" && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-bad/30 bg-bad-soft/60 p-2 text-[12px] text-bad">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>CAD style “{cadEffective(cad.styleNumber)}” does not match the entered style “{enteredStyle}”. This CAD may belong to a different style.</span>
        </div>
      )}
      {styleMatch === "MATCH" && <div className="mt-1.5 flex items-center gap-1 text-[11.5px] text-ok"><Check size={12} /> CAD style matches the entered style number</div>}
      <div className="mt-1 text-[11px] text-ink-3">{cadUsable(cad.lengthPerSet) ? "Length / Set is ready to feed costing." : "Length / Set must be verified before it is used in costing."}</div>
    </div>
  );
}
