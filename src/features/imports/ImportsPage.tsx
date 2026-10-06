"use client";
import * as React from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { FileDrop } from "@/components/ui/filedrop";
import { useToast } from "@/components/ui/toast";
import { api, type ImportReportDto } from "@/features/costing/api";
import { dateTime } from "@/lib/format";

export function ImportsPage() {
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ImportReportDto | null>(null);
  const [history, setHistory] = React.useState<Awaited<ReturnType<typeof api.imports>>>([]);
  const load = React.useCallback(() => api.imports().then(setHistory).catch(() => {}), []);
  React.useEffect(() => { load(); }, [load]);

  const run = async (kind: "actual" | "client", f: File) => {
    setBusy(kind);
    try {
      const r = await api.importWorkbook(kind, f);
      setReport(r);
      toast.push({ kind: r.issues.some((i) => i.level === "error") ? "warn" : "ok", title: `${r.fileName} imported`, body: `${r.created} new version(s), ${r.skipped} unchanged, ${r.stylesCreated} style(s) created.` });
      load();
    } catch (e) {
      toast.push({ kind: "error", title: "Import failed", body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_1fr] gap-4">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Actual costing workbook" subtitle="One worksheet per style (actual costing.xlsx layout)" />
            <div className="p-3"><FileDrop accept=".xlsx" onFile={(f) => run("actual", f)} busy={busy === "actual"} title="Drop actual costing .xlsx" hint="Every visible sheet becomes a style's Actual costing" /></div>
          </Card>
          <Card>
            <CardHeader title="Client costing workbook" subtitle="Cost Item rows with FOB / PO block (client costing.xlsx layout)" />
            <div className="p-3"><FileDrop accept=".xlsx" onFile={(f) => run("client", f)} busy={busy === "client"} title="Drop client costing .xlsx" hint="Style image, categories and UOM list are imported too" /></div>
          </Card>
        </div>
        <Card>
          <CardHeader title="How imports behave" />
          <ul className="space-y-1.5 p-4 text-[12.5px] text-ink-2">
            <li>• The workbook is stored unchanged, then read structurally (anchor labels / header names – no fixed cell addresses).</li>
            <li>• Each sheet becomes <b>version N+1</b> of that style&apos;s costing. A sheet identical to the latest import is skipped, so re-importing is safe.</li>
            <li>• Formula anomalies, title mismatches and ambiguous labels are reported, never silently corrected.</li>
            <li>• The whole workbook is imported in one transaction – a failure leaves nothing half-imported.</li>
          </ul>
        </Card>
      </div>
      <div className="space-y-4">
        {report && (
          <Card>
            <CardHeader title="Last import report" subtitle={`${report.fileName} · ${report.kind}`} />
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[["Sheets", report.sheets], ["New versions", report.created], ["Unchanged", report.skipped], ["Styles created", report.stylesCreated]].map(([k, v]) => (
                  <div key={String(k)} className="rounded-md bg-surface-2 p-2"><div className="num text-[18px] font-bold">{v}</div><div className="text-[10.5px] uppercase tracking-wide text-ink-3">{k}</div></div>
                ))}
              </div>
              <IssueList issues={report.issues} />
            </div>
          </Card>
        )}
        <Card>
          <CardHeader title="Import history" />
          {history.length === 0 ? (
            <div className="p-4 text-[12.5px] text-ink-3">No imports yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileSpreadsheet size={16} className="shrink-0 text-ink-3" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{h.fileName}</div>
                      <div className="text-[11.5px] text-ink-3">{dateTime(h.createdAt)} · {h.createdBy}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={h.kind === "ACTUAL" ? "actual" : "client"}>{h.kind}</Badge>
                    <span className="text-[12px] text-ink-2">{h.sheetCount} sheets · {h.created} new · {h.skipped} unchanged</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: ImportReportDto["issues"] }) {
  if (!issues.length) return <div className="flex items-center gap-1.5 text-[12.5px] text-ok"><CheckCircle2 size={14} /> No warnings.</div>;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-warn"><AlertTriangle size={13} /> {issues.length} item(s) to review</div>
      <ul className="max-h-72 divide-y divide-line overflow-auto rounded-md border border-line">
        {issues.map((i, k) => (
          <li key={k} className="flex items-start gap-2 px-2.5 py-1.5 text-[12px]">
            <Badge tone={i.level === "error" ? "bad" : "warn"} className="mt-0.5 shrink-0">{i.code}</Badge>
            <span>{i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
