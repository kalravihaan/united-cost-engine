"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/format";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "icon";
  asChild?: boolean;
};

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 select-none";
const buttonVariants = {
  primary: "bg-accent text-white hover:bg-[#162a45] shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  outline: "border border-line-strong text-ink-2 hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-black/5",
  danger: "bg-bad text-white hover:bg-[#8e1c12]",
};
const buttonSizes = { sm: "h-7 px-2.5 text-[12px]", md: "h-8 px-3 text-[13px]", icon: "h-7 w-7" };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", asChild, className, ...p }, ref) {
  const C = asChild ? Slot : "button";
  return <C ref={ref} className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)} {...p} />;
});

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-line-strong bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-surface-2 disabled:text-ink-3",
        className,
      )}
      {...p}
    />
  );
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select
      ref={ref}
      className={cn("h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-surface-2", className)}
      {...p}
    >
      {children}
    </select>
  );
});

export function Label({ children, className, hint }: { children: React.ReactNode; className?: string; hint?: React.ReactNode }) {
  return (
    <div className={cn("mb-1 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3", className)}>
      <span>{children}</span>
      {hint && <span className="normal-case tracking-normal font-normal">{hint}</span>}
    </div>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "cad" | "actual" | "client" | "accent";
const tones: Record<Tone, string> = {
  neutral: "bg-black/5 text-ink-2",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  cad: "bg-cad-soft text-cad",
  actual: "bg-actual-soft text-actual",
  client: "bg-client-soft text-client",
  accent: "bg-accent-soft text-accent",
};
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[10.5px] font-semibold leading-4 tracking-wide", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2.5", className)}>
      <div className="min-w-0">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-2">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-[12px] text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: React.ReactNode; tone?: "actual" | "client" | "neutral"; disabled?: boolean }>; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex rounded-md border border-line-strong bg-surface-2 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const toneActive = o.tone === "actual" ? "bg-actual text-white" : o.tone === "client" ? "bg-client text-white" : "bg-accent text-white";
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn("h-7 rounded px-3 text-[12px] font-semibold tracking-wide transition-colors disabled:opacity-40", active ? `${toneActive} shadow-sm` : "text-ink-2 hover:text-ink")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-black/[0.06]", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}

export function EmptyState({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="text-[13px] font-semibold text-ink">{title}</div>
      {children && <div className="max-w-md text-[12.5px] text-ink-2">{children}</div>}
    </div>
  );
}
