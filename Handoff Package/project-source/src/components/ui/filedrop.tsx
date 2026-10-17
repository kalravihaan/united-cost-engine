"use client";
import * as React from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/format";
import { Spinner } from "./primitives";

/** Drag-and-drop / click file picker. */
export function FileDrop({ accept, onFile, busy, title, hint, className, disabled, compact }: { accept: string; onFile: (f: File) => void; busy?: boolean; title: string; hint?: string; className?: string; disabled?: boolean; compact?: boolean }) {
  const [over, setOver] = React.useState(false);
  const ref = React.useRef<HTMLInputElement>(null);
  const take = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && ref.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-center transition-colors",
        compact ? "px-3 py-4" : "px-4 py-8",
        over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-2 hover:border-ink-3 hover:bg-white",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      {busy ? <Spinner className="text-accent" /> : <UploadCloud size={compact ? 18 : 22} className="text-ink-3" />}
      <div className="text-[12.5px] font-semibold text-ink">{busy ? "Working…" : title}</div>
      {hint && <div className="text-[11.5px] text-ink-3">{hint}</div>}
    </div>
  );
}
