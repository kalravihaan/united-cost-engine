"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Calculator, Database, LayoutTemplate, Layers, Settings2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/overlay";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import { hasUnsaved, LEAVE_MESSAGE } from "@/features/costing/unsaved";

const NAV = [
  { href: "/", label: "Cost Engine", icon: Calculator },
  { href: "/styles", label: "Styles", icon: Layers },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/analysis", label: "Analysis", icon: BarChart3 },
  { href: "/masters", label: "Masters", icon: Database },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <TooltipProvider>
      <ToastProvider>
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
            <div className="mx-auto flex h-[52px] max-w-[1760px] items-center justify-between px-5">
              <div className="flex items-center gap-8">
                <Link href="/" className="flex items-baseline gap-2.5">
                  <span className="text-[13px] font-bold tracking-[0.14em] text-accent">UNITED TEXTILE MILLS</span>
                  <span className="text-[13px] font-medium text-ink-3">Cost Engine</span>
                </Link>
                <nav className="flex items-center gap-0.5">
                  {NAV.map((n) => {
                    const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
                    return (
                      <Link
                        key={n.href}
                        href={n.href}
                        onClick={(e) => {
                          // leaving the Cost Engine with typed-in, unsaved values: ask first
                          if (path === "/" && n.href !== "/" && hasUnsaved() && !window.confirm(LEAVE_MESSAGE)) e.preventDefault();
                        }}
                        className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors", active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-black/5 hover:text-ink")}
                      >
                        <n.icon size={14} />
                        {n.label}
                      </Link>
                    );
                  })}
                </nav>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-ink-3">
                <Settings2 size={13} />
                <span>Acting as</span>
                <UserChip />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1760px] flex-1 px-5 py-4">{children}</main>
        </div>
      </ToastProvider>
    </TooltipProvider>
  );
}

function UserChip() {
  // No authentication yet: the name is sent as `x-user` and recorded on versions / audit events.
  const [name, setName] = useUserName();
  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      aria-label="Acting user"
      className="h-7 w-36 rounded-md border border-transparent bg-transparent px-2 text-[12px] font-medium text-ink hover:border-line-strong focus:border-accent focus:bg-surface focus:outline-none"
    />
  );
}

import { useUserName } from "@/features/costing/user";
