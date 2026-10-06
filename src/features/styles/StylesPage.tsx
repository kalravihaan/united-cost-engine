"use client";
import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { api, type StyleRow } from "@/features/costing/api";
import { rupee } from "@/lib/format";

export function StylesPage() {
  const [rows, setRows] = React.useState<StyleRow[] | null>(null);
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => api.styles(q).then(setRows).catch(() => setRows([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
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
                    <td className="pr-4 text-right">
                      <Link href={`/?style=${s.id}`} className="text-[12px] font-medium text-accent hover:underline">Open →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
