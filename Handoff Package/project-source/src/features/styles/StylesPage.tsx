"use client";
import * as React from "react";
import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { api, type StyleImpact, type StyleRow } from "@/features/costing/api";
import { rupee } from "@/lib/format";

export function StylesPage() {
  const [rows, setRows] = React.useState<StyleRow[] | null>(null);
  const [q, setQ] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const [doomed, setDoomed] = React.useState<StyleRow | null>(null);
  const toast = useToast();
  React.useEffect(() => {
    const t = setTimeout(() => api.styles(q).then(setRows).catch(() => setRows([])), 200);
    return () => clearTimeout(t);
  }, [q, reload]);
  return (
    <>
    <Card>
      <CardHeader
        title="Styles"
        subtitle={rows ? `${rows.length} style${rows.length === 1 ? "" : "s"}` : "Loading…"}
        actions={
          <div className="relative w-64">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search style, colour…" className="pl-8" aria-label="Search styles" />
          </div>
        }
      />
      {rows === null ? (
        <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No styles" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                <th className="px-4 py-2">Style</th>
                <th>Colour</th>
                <th>Customer</th>
                <th>Brand</th>
                <th>Category</th>
                <th className="text-right">Actual cost / pc</th>
                <th className="text-right">Client cost / pc</th>
                <th className="pr-4 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const a = s.costings.find((c) => c.type === "ACTUAL");
                const c = s.costings.find((x) => x.type === "CLIENT");
                return (
                  <tr key={s.id} className="border-t border-line hover:bg-[#f7f9fc]">
                    <td className="px-4 py-2 font-semibold">{s.number}</td>
                    <td className="text-ink-2">{s.color ?? "—"}</td>
                    <td className="text-ink-2">{s.customer ?? <span className="text-ink-3">unassigned</span>}</td>
                    <td className="text-ink-2">{s.brand ?? <span className="text-ink-3">—</span>}</td>
                    <td className="text-ink-2">{s.category ?? <span className="text-ink-3">—</span>}</td>
                    <td className="num text-right">{a ? <>{rupee(a.costPerPc)} <Badge tone="actual">v{a.versionNo}</Badge></> : <span className="text-ink-3">—</span>}</td>
                    <td className="num text-right">{c ? <>{rupee(c.costPerPc)} <Badge tone="client">v{c.versionNo}</Badge></> : <span className="text-ink-3">—</span>}</td>
                    <td className="whitespace-nowrap pr-4 text-right">
                      <Link href={`/?style=${s.id}`} className="text-[12px] font-medium text-accent hover:underline">Open →</Link>
                      <button onClick={() => setDoomed(s)} className="ml-3 rounded p-1 align-middle text-ink-3 hover:bg-bad-soft hover:text-bad" aria-label={`Delete style ${s.number}`} title="Delete style">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>

      <DeleteStyleDialog
        style={doomed}
        onClose={() => setDoomed(null)}
        onDeleted={(n) => {
          setDoomed(null);
          setReload((x) => x + 1);
          toast.push({ kind: "ok", title: `Style ${n} deleted`, body: "Its costings, versions, CAD and uploads were removed. The audit trail keeps a record." });
        }}
      />
    </>
  );
}

function DeleteStyleDialog({ style, onClose, onDeleted }: { style: StyleRow | null; onClose: () => void; onDeleted: (number: string) => void }) {
  const [impact, setImpact] = React.useState<StyleImpact | null>(null);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setImpact(null);
    setTyped("");
    setError(null);
    if (!style) return;
    api.styleImpact(style.id).then(setImpact).catch((e) => setError((e as Error).message));
  }, [style]);

  const versions = impact?.costings.reduce((n, c) => n + c.versions, 0) ?? 0;
  const go = async () => {
    if (!style) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteStyle(style.id, style.number);
      onDeleted(style.number);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!style} onOpenChange={(o) => !o && onClose()} title={`Delete style ${style?.number ?? ""}?`} description="This cannot be undone." width="max-w-lg">
      <div className="space-y-3 text-[12.5px]">
        {!impact && !error ? (
          <div className="text-ink-3">Checking what is stored for this style…</div>
        ) : impact ? (
          <div className="rounded-md border border-bad/30 bg-bad-soft/50 p-3">
            <div className="mb-1 font-semibold text-bad">This will permanently remove:</div>
            <ul className="list-disc space-y-0.5 pl-5 text-ink-2">
              <li>{impact.costings.length === 0 ? "no costings" : impact.costings.map((c) => `${c.type === "ACTUAL" ? "Actual" : "Client"} costing (${c.versions} saved version${c.versions === 1 ? "" : "s"})`).join(" and ")}</li>
              <li>{impact.cadRuns} CAD reading{impact.cadRuns === 1 ? "" : "s"}, {impact.files} uploaded file{impact.files === 1 ? "" : "s"} (image, CAD PDF)</li>
              <li>{impact.aliases} confirmed alias{impact.aliases === 1 ? "" : "es"}</li>
            </ul>
            <p className="mt-2 text-ink-3">The audit trail keeps its {impact.auditEvents} earlier entr{impact.auditEvents === 1 ? "y" : "ies"} and records this deletion. Customers, brands, templates and masters are not affected.{versions > 0 ? " Export or Save data file first if you may need these costings again." : ""}</p>
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Type the style number to confirm</label>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={style?.number} aria-label="Confirm style number" autoComplete="off" />
        </div>
        {error && <div className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-bad">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy || !impact || typed.trim() !== style?.number} onClick={go}>Delete style</Button>
        </div>
      </div>
    </Dialog>
  );
}
