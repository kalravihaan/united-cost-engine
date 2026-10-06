"use client";
import * as React from "react";
import { RotateCcw } from "lucide-react";
import type { LineField, Provenance, SourceRef } from "@/types/costing";
import { Tip } from "@/components/ui/overlay";
import { cn, dateTime } from "@/lib/format";

export const ORIGIN_LABEL: Record<Provenance["origin"], string> = {
  IMPORT: "Import",
  CAD: "CAD",
  MANUAL: "Manual",
  OVERRIDE: "Override",
  DERIVED: "Derived",
  TEMPLATE: "Template",
  MASTER: "Master",
  DEFAULT: "Default",
};

const ORIGIN_STYLE: Record<Provenance["origin"], string> = {
  IMPORT: "bg-black/[0.05] text-ink-3",
  CAD: "bg-cad-soft text-cad",
  MANUAL: "bg-accent-soft text-accent",
  OVERRIDE: "bg-warn-soft text-warn",
  DERIVED: "bg-black/[0.05] text-ink-2",
  TEMPLATE: "bg-warn-soft text-warn",
  MASTER: "bg-accent-soft text-accent",
  DEFAULT: "bg-black/[0.05] text-ink-3",
};

export function refText(r?: SourceRef): string {
  if (!r) return "";
  if (r.note && !r.sheet) return r.note;
  const parts = [r.file?.replace(/\.xlsx$/i, ""), r.sheet ? `Sheet ${r.sheet}` : null, r.column ?? null, r.cell ? `cell ${r.cell}` : null].filter(Boolean);
  return parts.join(" → ") + (r.note ? ` (${r.note})` : "");
}

function fmt(v: unknown, unit?: string): string {
  if (v === null || v === undefined || v === "") return "(blank)";
  return `${v}${unit ? ` ${unit}` : ""}`;
}

export function ProvenanceBody({ prov, value, unit, label }: { prov?: Provenance; value: unknown; unit?: string; label?: string }) {
  if (!prov) {
    return <div>{label ? `${label}: ` : ""}{fmt(value, unit)} — no recorded source</div>;
  }
  return (
    <div className="space-y-1">
      <div className="font-semibold">
        {label ? `${label} · ` : ""}
        {ORIGIN_LABEL[prov.origin]} {fmt(value, unit)}
      </div>
      {prov.ref && <div className="text-white/80">Source: {refText(prov.ref)}</div>}
      {prov.origin === "OVERRIDE" && prov.original && (
        <div className="rounded bg-white/10 px-1.5 py-1">
          <div>
            Original [{ORIGIN_LABEL[prov.original.origin]}]: {fmt(prov.original.value, unit)}
          </div>
          {prov.original.ref && <div className="text-white/70">{refText(prov.original.ref)}</div>}
        </div>
      )}
      {prov.origin !== "OVERRIDE" && prov.original && (
        <div className="rounded bg-white/10 px-1.5 py-1">
          Replaced [{ORIGIN_LABEL[prov.original.origin]}] {fmt(prov.original.value, unit)} (kept)
          {prov.original.ref && <div className="text-white/70">{refText(prov.original.ref)}</div>}
        </div>
      )}
      {prov.origin === "TEMPLATE" && <div className="text-amber-200">Copied from a template — verify before use.</div>}
      {(prov.by || prov.at) && (
        <div className="text-white/60">
          {prov.by}
          {prov.by && prov.at ? " · " : ""}
          {prov.at ? dateTime(prov.at) : ""}
        </div>
      )}
      {prov.reason && <div className="text-white/70">“{prov.reason}”</div>}
    </div>
  );
}

/** Small origin tag next to an editable number. IMPORT stays a quiet dot; CAD/override/etc. are visible. */
export function ProvTag({
  prov,
  value,
  unit,
  label,
  onRevert,
}: {
  prov?: Provenance;
  value: unknown;
  unit?: string;
  label?: string;
  onRevert?: () => void;
}) {
  const origin = prov?.origin;
  const visible = origin && origin !== "IMPORT" && origin !== "DEFAULT";
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <Tip content={<ProvenanceBody prov={prov} value={value} unit={unit} label={label} />} side="top">
        {visible ? (
          <span className={cn("cursor-help rounded px-1 py-[1px] text-[9.5px] font-bold uppercase leading-[14px] tracking-wide", ORIGIN_STYLE[origin!])}>
            {origin === "OVERRIDE" ? "OVR" : origin === "TEMPLATE" ? "TPL" : ORIGIN_LABEL[origin!]}
          </span>
        ) : (
          <span className="inline-block h-3.5 w-3.5 cursor-help rounded-full text-center text-[9px] leading-[14px] text-ink-3/70 hover:bg-black/5" aria-label="Source">
            ⓘ
          </span>
        )}
      </Tip>
      {origin === "OVERRIDE" && onRevert && (
        <Tip content="Revert to the original value">
          <button onClick={onRevert} className="rounded p-0.5 text-warn hover:bg-warn-soft" aria-label="Revert override">
            <RotateCcw size={11} />
          </button>
        </Tip>
      )}
    </span>
  );
}

export const FIELD_COLUMN: Record<LineField, string> = {
  quantity: "Quantity",
  rate: "Rate",
  uom: "Quantity UOM",
  gstRate: "GST",
  description: "Description",
  amount: "Amount",
  item: "Cost Item",
};
