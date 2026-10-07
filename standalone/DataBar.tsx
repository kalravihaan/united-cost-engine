"use client";
import * as React from "react";
import { Download, FolderOpen, RotateCcw } from "lucide-react";
import { applyPayload, buildPayload, clearAutosave, fromFileBytes, onSaveState, saveNow, toFileBytes, type Payload } from "./persist";

/** Where the data lives: browser autosave + an explicit data file you can keep, copy or e-mail. */
export function DataBar({ seed, onReloaded }: { seed: Payload; onReloaded: () => void }) {
  const [state, setState] = React.useState<{ at: Date | null; error: string | null }>({ at: null, error: null });
  const [msg, setMsg] = React.useState<string | null>(null);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => onSaveState(setState), []);

  const say = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg((x) => (x === m ? null : x)), 6000);
  };
  const download = async () => {
    const { bytes, gzip } = await toFileBytes(buildPayload());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: gzip ? "application/gzip" : "application/json" }));
    a.download = `cost-engine-data-${new Date().toISOString().slice(0, 10)}.ucedata`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    say("Data file saved. Keep it safe: it holds all styles, costings, uploads and history.");
  };
  const openFile = async (f: File) => {
    try {
      const p = await fromFileBytes(new Uint8Array(await f.arrayBuffer()));
      if (!window.confirm("Open this data file? It replaces everything currently in this browser (save a data file first if you need it).")) return;
      applyPayload(p);
      await saveNow();
      onReloaded();
      say(`Opened ${f.name}.`);
    } catch (e) {
      say((e as Error).message);
    }
  };
  const reset = async () => {
    if (!window.confirm("Start empty? This erases all styles, costings and uploads in this browser and restores the default templates. Save a data file first if you need it.")) return;
    applyPayload(seed);
    await clearAutosave();
    await saveNow();
    onReloaded();
    say("Started empty with the default templates.");
  };
  const btn = "inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-[11.5px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink";
  return (
    <div className="fixed bottom-3 left-3 z-50 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface/95 px-2 py-1.5 shadow-lg backdrop-blur" role="region" aria-label="Data">
      <span className="px-1 text-[11.5px] text-ink-3">
        {state.error ? <span className="text-bad">Not saved in this browser: {state.error}</span> : state.at ? `Auto-saved in this browser ${state.at.toLocaleTimeString()}` : "Data is kept in this browser"}
      </span>
      <button className={btn} onClick={download} title="Download all data as one file"><Download size={12} /> Save data file</button>
      <button className={btn} onClick={() => input.current?.click()} title="Replace the data with a saved data file"><FolderOpen size={12} /> Open data file</button>
      <button className={btn} onClick={reset} title="Erase everything and start with the default templates"><RotateCcw size={12} /> Start empty</button>
      <input ref={input} type="file" accept=".ucedata,.json,.gz" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) openFile(f); }} />
      {msg && <span className="px-1 text-[11.5px] font-medium text-accent">{msg}</span>}
    </div>
  );
}
