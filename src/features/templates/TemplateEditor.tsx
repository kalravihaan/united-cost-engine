"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import type { ActualCosting, ClientCosting, CostingDoc } from "@/types/costing";
import { calculateActualCost, calculateClientCost } from "@/lib/calculations";
import { Button, Card, CardHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/features/costing/api";
import { ActualTable, ClientTable } from "@/features/costing/CostingTable";

/** Edit the default headers/rows of a mode. Quantities and rates are not part of a template. */
export function TemplateEditor({ type }: { type: "ACTUAL" | "CLIENT" }) {
  const toast = useToast();
  const [doc, setDoc] = React.useState<CostingDoc | null | undefined>(undefined);
  const [version, setVersion] = React.useState(0);
  const [dirty, setDirty] = React.useState(false);
  const [uoms, setUoms] = React.useState<string[]>([]);
  React.useEffect(() => {
    api.template(type).then((t) => { setDoc(t.doc); setVersion(t.version); }).catch(() => setDoc(null));
    api.masterList("uoms").then((r) => setUoms((r as Array<{ code: string }>).map((x) => x.code))).catch(() => {});
  }, [type]);
  const result = React.useMemo(() => (doc ? (doc.type === "ACTUAL" ? calculateActualCost(doc) : calculateClientCost(doc)) : null), [doc]);
  const label = type === "ACTUAL" ? "Actual costing" : "Client costing";
  const save = async () => {
    if (!doc) return;
    try {
      const r = await api.saveTemplate(type, doc);
      toast.push({ kind: "ok", title: `${label} template saved (v${r.version})`, body: "New costings start from this structure. Existing costings are not changed." });
      const t = await api.template(type);
      setDoc(t.doc);
      setVersion(t.version);
      setDirty(false);
    } catch (e) {
      toast.push({ kind: "error", title: "Could not save", body: (e as Error).message });
    }
  };
  const edit = <T extends CostingDoc>(fn: (d: T) => T) => {
    setDoc((d) => (d ? fn(d as T) : d));
    setDirty(true);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link href="/templates" className="flex items-center gap-1 text-[12.5px] font-medium text-ink-2 hover:text-accent"><ArrowLeft size={14} /> Templates</Link>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={save}><Save size={13} /> Save template</Button>
      </div>
      <Card className="overflow-hidden">
        <CardHeader title={`${label} template`} subtitle={`v${version} · Add headers and rows, rename them, set default UOM and GST. Removing here removes the row for every new costing.`} />
        {doc === undefined ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : doc === null || !result ? (
          <div className="p-6 text-[13px] text-ink-2">No template exists yet. Build one from a reference workbook on the Templates page.</div>
        ) : doc.type === "ACTUAL" && result.type === "ACTUAL" ? (
          <ActualTable doc={doc} result={result} edit={(fn) => edit<ActualCosting>(fn)} issues={[]} uoms={uoms} showRemoved={false} structure />
        ) : doc.type === "CLIENT" && result.type === "CLIENT" ? (
          <ClientTable doc={doc} result={result} edit={(fn) => edit<ClientCosting>(fn)} issues={[]} uoms={uoms} showRemoved={false} structure />
        ) : null}
      </Card>
    </div>
  );
}
