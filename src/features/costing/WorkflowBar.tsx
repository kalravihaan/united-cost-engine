"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, Plus, Search } from "lucide-react";
import { Badge, Button, Card, Input, Label, Segmented, Spinner } from "@/components/ui/primitives";
import { Combobox } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { api, type MatchResult } from "./api";
import type { CategoryOption, CostingType, Workbench } from "./useWorkspace";
import { fracPct } from "@/lib/format";
import Link from "next/link";

interface Brand {
  id: string;
  name: string;
  customerId: string;
}

export function WorkflowBar({ wb, mode, setMode }: { wb: Workbench; mode: CostingType; setMode: (m: CostingType) => void }) {
  const toast = useToast();
  const { ws } = wb;
  const [customers, setCustomers] = React.useState<Array<{ id: string; label: string }>>([]);
  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [customerId, setCustomerId] = React.useState<string | null>(null);
  const [brandId, setBrandId] = React.useState<string | null>(null);
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [match, setMatch] = React.useState<MatchResult | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const loadMasters = React.useCallback(() => {
    api.masterOptions("customers").then(setCustomers).catch(() => {});
    api.masterList("brands").then((b) => setBrands(b as unknown as Brand[])).catch(() => {});
    api.masterList("categories").then((c) => setCategories((c as Array<Record<string, unknown>>).filter((x) => x.active !== false).map((x) => ({ id: x.id as string, name: x.name as string, overheadMarginRate: (x.overheadMarginRate as number | null) ?? null, source: (x.source as string | null) ?? null })))).catch(() => {});
  }, []);
  React.useEffect(loadMasters, [loadMasters]);

  // reflect the loaded style
  React.useEffect(() => {
    if (ws) {
      setQuery(ws.style.number);
      setCustomerId(ws.style.customerId);
      setBrandId(ws.style.brandId);
      setCategoryId(ws.style.categoryId);
      setMatch(null);
    }
  }, [ws?.style.id, ws?.style.customerId, ws?.style.brandId, ws?.style.categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced matching while typing
  React.useEffect(() => {
    const q = query.trim();
    if (!q || (ws && q === ws.style.number)) {
      setMatch(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.match(q);
        setMatch(r);
        if (r.status === "EXACT" && r.best) await wb.loadStyle(r.best.id);
      } catch {
        setMatch(null);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMapping = async (patch: { customerId?: string | null; brandId?: string | null; categoryId?: string | null }) => {
    if (patch.customerId !== undefined) setCustomerId(patch.customerId);
    if (patch.brandId !== undefined) setBrandId(patch.brandId);
    if (patch.categoryId !== undefined) setCategoryId(patch.categoryId);
    if (!ws) return;
    try {
      await api.updateMapping(ws.style.id, patch);
      await wb.refresh(true);
    } catch (e) {
      toast.push({ kind: "error", title: "Could not update mapping", body: (e as Error).message });
    }
  };

  const createStyle = async () => {
    setCreating(true);
    try {
      const s = await api.createStyle({ number: query.trim(), customerId, brandId, categoryId });
      await wb.loadStyle(s.id);
      toast.push({ kind: "ok", title: `Style ${s.number} created` });
    } catch (e) {
      toast.push({ kind: "error", title: "Could not create style", body: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const confirmMatch = async (id: string) => {
    try {
      await api.confirmAlias(id, query.trim(), "confirmed from the style box");
      await wb.loadStyle(id);
    } catch (e) {
      toast.push({ kind: "error", title: "Could not confirm", body: (e as Error).message });
    }
  };

  const brandOptions = brands.filter((b) => !customerId || b.customerId === customerId).map((b) => ({ value: b.id, label: b.name }));
  const have = (t: CostingType) => (t === "ACTUAL" ? !!wb.drafts.ACTUAL : !!wb.drafts.CLIENT);

  return (
    <Card className="relative z-30">
      <div className="grid grid-cols-[1.15fr_1fr_1fr_1.05fr_auto] gap-4 px-4 py-3.5">
        <div>
          <Label hint={<Link href="/masters?tab=customers" className="text-accent hover:underline">manage</Link>}>1 · Customer / Brand</Label>
          <div className="grid grid-cols-2 gap-1.5">
            <Combobox value={customerId} onChange={(v) => setMapping({ customerId: v, brandId: null })} options={customers.map((c) => ({ value: c.id, label: c.label }))} placeholder="Customer" searchPlaceholder="Search customers…" emptyText="No customers yet – add one in Masters" />
            <Combobox value={brandId} onChange={(v) => setMapping({ brandId: v })} options={brandOptions} placeholder="Brand" searchPlaceholder="Search brands…" emptyText={customerId ? "No brands for this customer" : "Select a customer first"} />
          </div>
        </div>
        <div className="relative">
          <Label hint={searching ? <Spinner className="text-ink-3" /> : undefined}>2 · Style number</Label>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. 72232" className="pl-8 font-semibold" aria-label="Style number" spellCheck={false} />
          </div>
          <MatchHint match={match} ws={!!ws && query.trim() === ws.style.number} query={query.trim()} onConfirm={confirmMatch} onCreate={createStyle} creating={creating} />
        </div>
        <div>
          <Label>3 · Category</Label>
          <Combobox
            value={categoryId}
            onChange={(v) => {
              setMapping({ categoryId: v });
              wb.applyCategory(categories.find((c) => c.id === v) ?? null);
            }}
            options={categories.map((c) => ({ value: c.id, label: c.name, hint: c.overheadMarginRate !== null ? `OH+M ${fracPct(c.overheadMarginRate)}` : undefined }))}
            placeholder="Category"
            searchPlaceholder="Search categories…"
          />
          <div className="mt-1 text-[11px] text-ink-3">Sets the Overhead+Margin rate of the client costing.</div>
        </div>
        <div>
          <Label>4 · Costing mode</Label>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "ACTUAL", label: <span className="flex items-center gap-1.5">ACTUAL COSTING {ws && <Dot on={have("ACTUAL")} />}</span>, tone: "actual" },
              { value: "CLIENT", label: <span className="flex items-center gap-1.5">CLIENT COSTING {ws && <Dot on={have("CLIENT")} />}</span>, tone: "client" },
            ]}
          />
          <div className="mt-1 text-[11px] text-ink-3">Two independent datasets – neither is derived from the other.</div>
        </div>
        <div className="flex items-end">
          {ws ? (
            <div className="text-right">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">Loaded</div>
              <div className="text-[15px] font-bold text-ink">{ws.style.number}</div>
              <div className="text-[11.5px] text-ink-3">{ws.style.color ?? ""}</div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span title={on ? "Costing exists" : "No costing yet"} className={`inline-block h-1.5 w-1.5 rounded-full ${on ? "bg-white/90" : "bg-current opacity-30"}`} />;
}

function MatchHint({ match, ws, query, onConfirm, onCreate, creating }: { match: MatchResult | null; ws: boolean; query: string; onConfirm: (id: string) => void; onCreate: () => void; creating: boolean }) {
  if (ws) return <div className="mt-1 flex items-center gap-1 text-[11.5px] text-ok"><CheckCircle2 size={12} /> Existing style selected</div>;
  if (!query || !match) return <div className="mt-1 text-[11px] text-ink-3">Type a style number — existing styles are matched, never guessed.</div>;
  if (match.status === "EXACT") return <div className="mt-1 text-[11.5px] text-ok">Matched {match.best?.number}…</div>;
  return (
    <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-line bg-surface p-2.5 shadow-xl fade-in">
      {match.status === "POSSIBLE" && match.best && (
        <div className="mb-2">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-warn"><AlertTriangle size={13} /> Possible match found — please confirm.</div>
          {[match.best, ...match.others].slice(0, 4).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-surface-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold">{m.number} <Badge tone={m.confidence >= 0.8 ? "warn" : "neutral"}>{Math.round(m.confidence * 100)}%</Badge></div>
                <div className="truncate text-[11px] text-ink-3">{m.reason}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => onConfirm(m.id)}>Use this</Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
        <div className="text-[11.5px] text-ink-2">{match.status === "NONE" ? "No existing style matches." : "None of these?"}</div>
        <Button size="sm" variant="primary" onClick={onCreate} disabled={creating}>
          {creating ? <Spinner /> : <Plus size={12} />} Create style {query}
        </Button>
      </div>
    </div>
  );
}
