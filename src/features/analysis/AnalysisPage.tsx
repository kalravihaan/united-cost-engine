"use client";
import * as React from "react";
import { Download } from "lucide-react";
import { SNAPSHOT, type SnapshotTable } from "@/lib/analysis/snapshot";
import { cn } from "@/lib/format";
import { Badge, Button, Card } from "@/components/ui/primitives";

interface Section {
  id: string;
  title: string;
  intro: string;
  tables: Array<{ sheet: string; title: string; note?: string }>;
}

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "Brands & segments",
    intro: "58 actual sheets from two workbooks, grouped by the product IDs they carry: YOUSTA (YAS…, vendor 32026735) and the KRTS family (YETKRTS / GETKRTS…, vendor RR10337044 – brand name not stated in any file). 5xxx styles are the CUT series, 4xxx/6xxx the FUT series.",
    tables: [
      { sheet: "1 Brand summary", title: "By brand family" },
      { sheet: "2 Segments", title: "By segment" },
      { sheet: "9 Sale price tiers", title: "Sale-rate tiers (₹/pc)" },
    ],
  },
  {
    id: "standard",
    title: "Standard cost",
    intro: "Median of the sheets in each segment, plain vs embellished (medians resist the few outliers). Use the min/max as the usual range.",
    tables: [{ sheet: "3 Standard cost", title: "Standard cost per piece (₹)" }],
  },
  {
    id: "fabric",
    title: "Fabric & consumption",
    intro: "Landed rate = (fabric purchase + its finishing / printing) ÷ metres purchased. The consumption cell is the figure typed in each sheet; purchased m/pc is what was actually bought per dispatched piece.",
    tables: [
      { sheet: "4 Fabric rates", title: "Landed fabric rate by fabric type (₹/m)" },
      { sheet: "4b Fabric by brand", title: "Fabric rate by brand family" },
      { sheet: "5 Consumption", title: "Consumption by brand family (m/pc)" },
      { sheet: "5b Consumption by fabric", title: "Consumption by fabric type" },
      { sheet: "5c Production reconciliation", title: "Fabric costed vs received / used / cut", note: "Costing is on ordered metres, not received metres – 18 of 21 sheets with notes show a shortfall." },
      { sheet: "5d CAD markers vs costing", title: "CAD markers vs the costing's consumption", note: "One CAD per style is stored for now; several markers per style is deferred." },
    ],
  },
  {
    id: "rates",
    title: "Embellishment, CMT & trims",
    intro: "Rate cards derived from the sheets: what each kind of embellishment, CMT cluster and trim costs.",
    tables: [
      { sheet: "6 Embellishment", title: "Embellishment rates" },
      { sheet: "6b Embellishment by brand", title: "Embellishment by brand" },
      { sheet: "7 CMT", title: "CMT per piece by segment and garment length" },
      { sheet: "7b CMT common values", title: "Most common CMT values" },
      { sheet: "8 Trims rate card", title: "Trims rate card" },
      { sheet: "8b Pcs per carton", title: "Pieces per carton" },
    ],
  },
  {
    id: "margins",
    title: "Margins",
    intro: "Profit as the sheets compute it (per-piece profit ÷ order rate); value loss is reported but not deducted, so real profit is lower where there is loss. YOUSTA PO vs actual comes from the YOUSTA cost summary.",
    tables: [
      { sheet: "10 Margins", title: "Margin by sheet" },
      { sheet: "11 YOUSTA PO vs actual", title: "YOUSTA: PO cost vs actual cost" },
    ],
  },
  {
    id: "pairs",
    title: "Client vs actual",
    intro: "Where a style has both an actual sheet and a readable client costing. Several client files are password protected and cannot be read until unlocked copies are supplied.",
    tables: [
      { sheet: "13 Client vs actual 5008", title: "5008: client costing vs actual (₹/pc)" },
      { sheet: "13b Client vs actual all pairs", title: "All pairs" },
      { sheet: "13c Coverage by style", title: "Coverage: actual · client · CAD per style" },
      { sheet: "12 Client sheets", title: "Client sheets read" },
      { sheet: "14 Colourways 5008-5009", title: "Colourways (one actual sheet per colour)" },
    ],
  },
  {
    id: "issues",
    title: "Data issues",
    intro: "Things in the source files that need a decision or a correction. They are reported, not silently fixed.",
    tables: [{ sheet: "15 Data issues", title: "Issues found" }],
  },
  {
    id: "about",
    title: "How it was built",
    intro: "Method notes behind every number.",
    tables: [{ sheet: "README", title: "Notes" }],
  },
];

const label = (c: string) => c.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
const fmt = (v: string | number | null): string => {
  if (v === null || v === "") return "";
  if (typeof v === "string") return v;
  if (Number.isInteger(v)) return v.toLocaleString("en-IN");
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function csv(t: SnapshotTable): string {
  const q = (v: string | number | null) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [t.columns.map(q).join(","), ...t.rows.map((r) => r.map(q).join(","))].join("\n");
}

function download(name: string, t: SnapshotTable) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv(t)], { type: "text/csv" }));
  a.download = `${name.replace(/[^a-z0-9]+/gi, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Table({ title, note, sheet }: { title: string; note?: string; sheet: string }) {
  const t = SNAPSHOT.tables[sheet];
  if (!t) return null;
  const isNotes = sheet === "README";
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {note && <p className="text-[11.5px] text-ink-3">{note}</p>}
        </div>
        {!isNotes && (
          <Button size="sm" variant="ghost" onClick={() => download(sheet, t)}><Download size={13} /> CSV</Button>
        )}
      </div>
      {isNotes ? (
        <ul className="space-y-1 rounded-lg border border-line bg-surface p-3 text-[12.5px] leading-relaxed text-ink-2">
          {t.rows.map((r, i) => (r[0] ? <li key={i} className="whitespace-pre-wrap">{String(r[0])}</li> : null))}
        </ul>
      ) : (
        <div className="max-h-[520px] overflow-auto rounded-lg border border-line">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-surface-2 text-[10.5px] uppercase tracking-[0.05em] text-ink-3">
              <tr>
                {t.columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2.5 py-2 text-left font-semibold">{label(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, i) => (
                <tr key={i} className="border-t border-line hover:bg-black/[0.02]">
                  {r.map((v, j) => (
                    <td key={j} className={cn("px-2.5 py-1.5", typeof v === "number" ? "num text-right" : "max-w-[420px]")}>{fmt(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AnalysisPage() {
  const [id, setId] = React.useState(SECTIONS[0].id);
  const sec = SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[18px] font-bold">Cost analysis</h1>
          <p className="text-[12.5px] text-ink-3">Standard costs, rates, consumption, margins and data issues derived from the reference costing sheets · snapshot of {SNAPSHOT.generated}</p>
        </div>
        <Badge tone="neutral">reference data – the Benchmarks tab of each style uses these numbers</Badge>
      </div>
      <div className="grid grid-cols-[210px_minmax(0,1fr)] items-start gap-4">
        <nav className="space-y-0.5 rounded-lg border border-line bg-surface p-1.5">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setId(s.id)} className={cn("block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors", s.id === id ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-black/5")}>
              {s.title}
            </button>
          ))}
        </nav>
        <Card className="space-y-5 p-4">
          <div>
            <h2 className="text-[15px] font-bold">{sec.title}</h2>
            <p className="mt-1 max-w-[900px] text-[12.5px] leading-relaxed text-ink-2">{sec.intro}</p>
          </div>
          {sec.tables.map((t) => (
            <Table key={t.sheet} {...t} />
          ))}
        </Card>
      </div>
    </div>
  );
}
