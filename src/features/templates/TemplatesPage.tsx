"use client";
import * as React from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import type { CostingDoc } from "@/types/costing";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui/primitives";
import { FileDrop } from "@/components/ui/filedrop";
import { useToast } from "@/components/ui/toast";
import { api } from "@/features/costing/api";
import { dateTime } from "@/lib/format";

type T = { type: string; format: string; version: number; doc: CostingDoc; source: string | null; updatedBy: string; updatedAt: string } | null;
type Layout = { key: string; label: string };

export function TemplatesPage() {
  const [actual, setActual] = React.useState<T | undefined>(undefined);
  const [layouts, setLayouts] = React.useState<Array<Layout & { t: T }> | undefined>(undefined);
  const load = React.useCallback(() => {
    api.template("ACTUAL").then(setActual).catch(() => setActual(null));
    api
      .clientFormats()
      .then(async (fs) => setLayouts(await Promise.all(fs.map(async (f) => ({ key: f.key, label: f.label, t: await api.template("CLIENT", f.key).catch(() => null) })))))
      .catch(() => setLayouts([]));
  }, []);
  React.useEffect(load, [load]);
  return (
    <div className="space-y-4">
      <div className="max-w-3xl text-[13px] text-ink-2">
        <h1 className="mb-1 text-[16px] font-semibold text-ink">Costing templates</h1>
        Every costing starts from a default template: <b>all</b> of its headers and rows, with no values. Edit the structure here once; on each style, remove the headers and rows that style does not need.
        Actual and Client templates are separate because their particulars differ, and <b>client costing has one layout per customer / brand</b> (different rows, headers and price chain). Assign a layout to a brand or customer under Masters.
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ActualCard t={actual} onChanged={load} />
        <div className="space-y-4">
          {layouts === undefined ? <Card><CardHeader title="Client costing layouts" subtitle="Loading…" /></Card> : layouts.map((l) => <ClientLayoutCard key={l.key} layout={l} t={l.t} onChanged={load} />)}
          <NewLayoutCard existing={layouts?.map((l) => l.key) ?? []} onChanged={load} />
        </div>
      </div>
    </div>
  );
}

function Sections({ t }: { t: NonNullable<T> }) {
  const sections = t.doc.type === "CLIENT" ? t.doc.client.sections.map((s) => s.label) : ["FABRIC ORDER", "CMT", "TRIMS", "LD CHARGES", "REJECT"];
  return (
    <>
      <div className="flex items-center gap-2 text-[12.5px]">
        <Badge tone={t.doc.type === "ACTUAL" ? "actual" : "client"}>{t.doc.lines.length} rows</Badge>
        <Badge tone="neutral">{sections.length} headers</Badge>
        {t.doc.type === "CLIENT" && t.doc.client.pricing && <Badge tone="neutral">{t.doc.client.pricing.finalPriceLabel}</Badge>}
      </div>
      <div className="flex flex-wrap gap-1.5">{sections.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}</div>
    </>
  );
}

function useRebuild(type: "ACTUAL" | "CLIENT", label: string, onChanged: () => void) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const run = async (f: File, format?: { key: string; label?: string }) => {
    setBusy(true);
    try {
      const r = await api.rebuildTemplate(type, f, format);
      toast.push({ kind: "ok", title: `${label} template built (v${r.version})`, body: `${r.lines} rows in ${r.sections} headers. Costings already saved are not changed.` });
      onChanged();
    } catch (e) {
      toast.push({ kind: "error", title: "Could not read the workbook", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function ActualCard({ t, onChanged }: { t: T | undefined; onChanged: () => void }) {
  const { busy, run } = useRebuild("ACTUAL", "Actual costing", onChanged);
  return (
    <Card>
      <CardHeader
        title="Actual costing"
        subtitle={t ? `v${t.version} · ${t.source ?? "edited"} · ${dateTime(t.updatedAt)} · ${t.updatedBy}` : t === null ? "No template yet" : "Loading…"}
        actions={t ? <Button asChild size="sm" variant="primary"><Link href="/templates/ACTUAL"><Pencil size={12} /> Edit structure</Link></Button> : undefined}
      />
      <div className="space-y-3 p-4">
        {t && <Sections t={t} />}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{t ? "Rebuild from a reference workbook" : "Build from a reference workbook"}</div>
          <FileDrop compact accept=".xlsx" onFile={(f) => run(f)} busy={busy} title="Drop an actual costing .xlsx" hint="Only its headers and row names are read. No values and no styles are imported." />
        </div>
      </div>
    </Card>
  );
}

function ClientLayoutCard({ layout, t, onChanged }: { layout: Layout; t: T; onChanged: () => void }) {
  const { busy, run } = useRebuild("CLIENT", `Client costing · ${layout.label}`, onChanged);
  return (
    <Card>
      <CardHeader
        title={`Client costing · ${layout.label}`}
        subtitle={t ? `v${t.version} · ${t.source ?? "edited"} · ${dateTime(t.updatedAt)} · ${t.updatedBy}` : "No template yet"}
        actions={t ? <Button asChild size="sm" variant="primary"><Link href={`/templates/CLIENT?format=${encodeURIComponent(layout.key)}`}><Pencil size={12} /> Edit structure</Link></Button> : undefined}
      />
      <div className="space-y-3 p-4">
        {t && <Sections t={t} />}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Rebuild from a reference workbook</div>
          <FileDrop compact accept=".xlsx" onFile={(f) => run(f, { key: layout.key, label: layout.label })} busy={busy} title={`Drop a ${layout.label} client costing .xlsx`} hint="Only headers and row names are read." />
        </div>
      </div>
    </Card>
  );
}

function NewLayoutCard({ existing, onChanged }: { existing: string[]; onChanged: () => void }) {
  const { busy, run } = useRebuild("CLIENT", "Client costing", onChanged);
  const [name, setName] = React.useState("");
  const key = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  const clash = !!key && existing.includes(key);
  return (
    <Card>
      <CardHeader title="Add a client costing layout" subtitle="For a customer or brand whose client costing sheet has different rows, headers or price chain." />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-ink-3" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Layout name, e.g. YOUSTA" aria-label="Layout name" />
        </div>
        {clash && <div className="text-[12px] text-warn">A layout with this key ({key}) exists. Use its card above to rebuild it.</div>}
        <FileDrop compact accept=".xlsx" disabled={!key || clash} onFile={(f) => run(f, { key, label: name.trim() })} busy={busy} title={key ? `Drop the ${name.trim()} client costing .xlsx` : "Enter the layout name first"} hint="Use one filled or blank sheet of that customer's format. Only headers and row names are read." />
      </div>
    </Card>
  );
}
