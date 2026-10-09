"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Plus, Trash2 } from "lucide-react";
import { MASTERS, type MasterDef, type MasterField } from "@/data/masterConfig";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Select, Skeleton } from "@/components/ui/primitives";
import { Combobox, Dialog } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { api } from "@/features/costing/api";
import { cn, fracPct } from "@/lib/format";

type Row = Record<string, unknown> & { id: string };

export function MastersPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const active = MASTERS.find((m) => m.name === sp.get("tab")) ?? MASTERS[0];
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-4">
      <nav className="sticky top-[68px] rounded-lg border border-line bg-surface p-1.5">
        <div className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">Masters</div>
        {MASTERS.map((m) => (
          <button key={m.name} onClick={() => router.replace(`/masters?tab=${m.name}`)} className={cn("flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium", m.name === active.name ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-black/5")}>
            {m.label}
          </button>
        ))}
        <Link href="/templates" className="mt-1 flex w-full items-center rounded-md border-t border-line px-2.5 py-1.5 pt-2 text-left text-[12.5px] font-medium text-ink-2 hover:bg-black/5">Costing Templates →</Link>
      </nav>
      <MasterTable key={active.name} def={active} />
    </div>
  );
}

function MasterTable({ def }: { def: MasterDef }) {
  const toast = useToast();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [refs, setRefs] = React.useState<Record<string, Array<{ id: string; label: string }>>>({});
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    setRows(null);
    try {
      setRows((await api.masterList(def.name)) as Row[]);
      const refNames = [...new Set(def.fields.filter((f) => f.type === "ref" && f.ref).map((f) => f.ref!))];
      const entries = await Promise.all(refNames.map(async (n) => [n, await api.masterOptions(n)] as const));
      setRefs(Object.fromEntries(entries));
    } catch (e) {
      toast.push({ kind: "error", title: `Could not load ${def.label}`, body: (e as Error).message });
      setRows([]);
    }
  }, [def, toast]);
  React.useEffect(() => { load(); }, [load]);

  const hasStandards = def.name === "fabrics" || def.name === "rates";
  const loadStandards = async () => {
    try {
      const r = await api.loadStandardRates();
      toast.push({ kind: "ok", title: "Standard rates loaded", body: `Rates: ${r.rates.added} (replaced ${r.rates.replaced}). Fabrics: ${r.fabrics.added} added, ${r.fabrics.updated} refreshed${r.fabrics.keptYours ? `, ${r.fabrics.keptYours} of yours kept` : ""}.` });
      await load();
    } catch (e) {
      toast.push({ kind: "error", title: "Could not load standard rates", body: (e as Error).message });
    }
  };

  const listFields = def.fields.filter((f) => f.list);
  const show = (f: MasterField, row: Row): React.ReactNode => {
    const v = row[f.key];
    if (v === null || v === undefined || v === "") return <span className="text-ink-3">—</span>;
    if (f.type === "boolean") return v ? <Badge tone="ok">Yes</Badge> : <Badge tone="neutral">No</Badge>;
    if (f.type === "percent") return fracPct(v as number);
    if (f.type === "ref") return refs[f.ref!]?.find((o) => o.id === v)?.label ?? String(v);
    if (f.type === "json") return <span className="font-mono text-[11px]">{JSON.stringify(v).slice(0, 80)}</span>;
    return String(v);
  };

  return (
    <Card>
      <CardHeader title={def.label} subtitle={def.description} actions={
        <div className="flex items-center gap-1.5">
          {hasStandards && <Button variant="outline" size="sm" onClick={loadStandards}><Download size={13} /> Load standard rates</Button>}
          {!def.noCreate && <Button variant="primary" size="sm" onClick={() => setCreating(true)}><Plus size={13} /> New</Button>}
        </div>
      } />
      {rows === null ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${def.label.toLowerCase()} yet`}>{def.noCreate ? "Rows appear here as the workflow creates them." : hasStandards ? "Use “Load standard rates” for the values from the cost analysis, or “New” to add your own." : "Use “New” to add the first one."}</EmptyState>
      ) : (
        <div className="max-h-[calc(100vh-190px)] overflow-auto">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {listFields.map((f) => <th key={f.key} className="px-4 py-2">{f.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-[#f7f9fc]">
                  {listFields.map((f, i) => <td key={f.key} className={cn("px-4 py-1.5", i === 0 && "font-medium")}>{show(f, r)}</td>)}
                  <td className="px-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                    {def.name === "mappings" && (
                      <Button size="sm" variant="ghost" aria-label="Remove alias" onClick={async () => { await api.masterDelete(def.name, r.id); load(); }}><Trash2 size={12} /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MasterDialog def={def} refs={refs} row={editing} open={creating || !!editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); load(); }} />
    </Card>
  );
}

function MasterDialog({ def, refs, row, open, onClose, onSaved }: { def: MasterDef; refs: Record<string, Array<{ id: string; label: string }>>; row: Row | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = React.useState<Record<string, unknown>>({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const init: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = row?.[f.key];
      init[f.key] = f.type === "percent" && typeof v === "number" ? parseFloat((v * 100).toFixed(4)) : f.type === "json" ? (v !== undefined ? JSON.stringify(v, null, 2) : "{}") : v ?? (f.type === "boolean" ? true : "");
    }
    setForm(init);
  }, [open, row, def]);

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      for (const f of def.fields) {
        if (row && f.readOnly) continue;
        let v = form[f.key];
        if (f.type === "percent" && v !== "" && v !== null) v = Number(v) / 100;
        body[f.key] = v;
      }
      if (row) await api.masterUpdate(def.name, row.id, body);
      else await api.masterCreate(def.name, body);
      toast.push({ kind: "ok", title: row ? "Saved" : "Created" });
      onSaved();
    } catch (e) {
      toast.push({ kind: "error", title: "Could not save", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={row ? `Edit ${def.label}` : `New ${def.label}`} description={def.noCreate && row ? "Identity fields are read-only." : undefined}>
      <div className="space-y-3">
        {def.fields.map((f) => {
          const ro = !!row && !!f.readOnly;
          return (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{f.label}{f.required && " *"}</span>
              {f.type === "boolean" ? (
                <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} disabled={ro} className="h-4 w-4 accent-[#1d3557]" />
              ) : f.type === "ref" ? (
                <Combobox value={(form[f.key] as string) || null} onChange={(v) => setForm({ ...form, [f.key]: v })} options={(refs[f.ref!] ?? []).map((o) => ({ value: o.id, label: o.label }))} disabled={ro} placeholder={`Select ${f.label.toLowerCase()}`} />
              ) : f.type === "select" ? (
                <Select value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} disabled={ro}>
                  {f.options!.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                </Select>
              ) : f.type === "json" ? (
                <textarea value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} rows={8} spellCheck={false} className="w-full rounded-md border border-line-strong p-2 font-mono text-[12px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" />
              ) : (
                <Input value={String(form[f.key] ?? "")} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} disabled={ro} inputMode={f.type === "number" || f.type === "percent" ? "decimal" : undefined} placeholder={f.type === "percent" ? "e.g. 8 for 8%" : undefined} />
              )}
            </label>
          );
        })}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy}>Save</Button>
        </div>
      </div>
    </Dialog>
  );
}
