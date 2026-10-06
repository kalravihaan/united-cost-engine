"use client";
import * as React from "react";
import { CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import { cn } from "@/lib/format";

type ToastKind = "ok" | "warn" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}
const Ctx = React.createContext<{ push: (t: Omit<ToastItem, "id">) => void }>({ push: () => {} });
export const useToast = () => React.useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.kind === "error" ? 8000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[360px] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={cn("fade-in pointer-events-auto flex gap-2.5 rounded-lg border bg-surface p-3 shadow-lg", t.kind === "error" ? "border-bad/30" : t.kind === "warn" ? "border-warn/30" : "border-line")}>
            {t.kind === "ok" && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" />}
            {t.kind === "warn" && <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />}
            {t.kind === "error" && <XCircle size={16} className="mt-0.5 shrink-0 text-bad" />}
            {t.kind === "info" && <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink">{t.title}</div>
              {t.body && <div className="mt-0.5 whitespace-pre-line text-[12px] text-ink-2">{t.body}</div>}
            </div>
            <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="h-fit rounded p-0.5 text-ink-3 hover:bg-black/5" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
