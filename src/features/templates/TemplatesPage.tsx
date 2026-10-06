"use client";
import * as React from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import type { CostingDoc } from "@/types/costing";
import { Badge, Button, Card, CardHeader } from "@/components/ui/primitives";
import { FileDrop } from "@/components/ui/filedrop";
import { useToast } from "@/components/ui/toast";
import { api } from "@/features/costing/api";
import { dateTime } from "@/lib/format";

type T = { type: string; version: number; doc: CostingDoc; source: string | null; updatedBy: string; updatedAt: string } | null;

export function TemplatesPage() {
  const [t, setT] = React.useState<{ ACTUAL: T | undefined; CLIENT: T | undefined }>({ ACTUAL: undefined, CLIENT: undefined });
  const load = React.useCallback(() => {
    for (const type of ["ACTUAL", "CLIENT"] as const) api.template(type).then((x) => setT((s) => ({ ...s, [type]: x }))).catch(() => setT((s) => ({ ...s, [type]: null })));
  }, []);
  React.useEffect(load, [load]);
  return (
    <div className="space-y-4">
      <div className="max-w-3xl text-[13px] text-ink-2">
        <h1 className="mb-1 text-[16px] font-semibold text-ink">Costing templates</h1>
        Every costing starts from the default template of its mode: <b>all</b> of that mode&apos;s headers and rows, with no values. Edit the structure here once; on each style, remove the headers and rows that style does not need. The Actual and Client templates are separate because their particulars differ.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TemplateCard type="ACTUAL" t={t.ACTUAL} onChanged={load} />
        <TemplateCard type="CLIENT" t={t.CLIENT} onChanged={load} />
      </div>
    </div>
  );
}

function TemplateCard({ type, t, onChanged }: { type: "ACTUAL" | "CLIENT"; t: T | undefined; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const sections = t ? (t.doc.type === "CLIENT" ? t.doc.client.sections.map((s) => s.label) : ["FABRIC ORDER", "CMT", "TRIMS", "LD CHARGES", "REJECT"]) : [];
  const label = type === "ACTUAL" ? "Actual costing" : "Client costing";
  const rebuild = async (f: File) => {
    setBusy(true);
    try {
      const r = await api.rebuildTemplate(type, f);
      toast.push({ kind: "ok", title: `${label} template rebuilt (v${r.version})`, body: `${r.lines} rows in ${r.sections} headers. Costings already saved are not changed.` });
      onChanged();
    } catch (e) {
      toast.push({ kind: "error", title: "Could not read the workbook", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader
        title={label}
        subtitle={t ? `v${t.version} · ${t.source ?? "edited"} · ${dateTime(t.updatedAt)} · ${t.updatedBy}` : t === null ? "No template yet" : "Loading…"}
        actions={t ? <Button asChild size="sm" variant="primary"><Link href={`/templates/${type}`}><Pencil size={12} /> Edit structure</Link></Button> : undefined}
      />
      <div className="space-y-3 p-4">
        {t && (
          <>
            <div className="flex items-center gap-2 text-[12.5px]">
              <Badge tone={type === "ACTUAL" ? "actual" : "client"}>{t.doc.lines.length} rows</Badge>
              <Badge tone="neutral">{sections.length} headers</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">{sections.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}</div>
          </>
        )}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{t ? "Rebuild from a reference workbook" : "Build from a reference workbook"}</div>
          <FileDrop compact accept=".xlsx" onFile={rebuild} busy={busy} title={`Drop a ${label.toLowerCase()} .xlsx`} hint="Only its headers and row names are read. No values and no styles are imported." />
        </div>
      </div>
    </Card>
  );
}
