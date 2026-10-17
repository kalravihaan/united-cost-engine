"use client";
import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/format";

/* ─────────── Tooltip ─────────── */
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={120} skipDelayDuration={200}>{children}</TooltipPrimitive.Provider>;
}

export function Tip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn("fade-in z-[60] max-w-[340px] rounded-md bg-[#101828] px-2.5 py-1.5 text-[11.5px] leading-snug text-white shadow-lg", className)}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[#101828]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ─────────── Dialog ─────────── */
export function Dialog({ open, onOpenChange, title, description, children, width = "max-w-lg" }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; children: React.ReactNode; width?: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#101828]/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content className={cn("fade-in fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl border border-line bg-surface shadow-2xl", width)}>
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div>
              <DialogPrimitive.Title className="text-[14px] font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-0.5 text-[12.5px] text-ink-2">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded p-1 text-ink-3 hover:bg-black/5 hover:text-ink" aria-label="Close">
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ─────────── Tabs ─────────── */
export const Tabs = TabsPrimitive.Root;
export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn("flex items-center gap-1 border-b border-line px-3", className)}>{children}</TabsPrimitive.List>;
}
export function TabsTrigger({ value, children, count }: { value: string; children: React.ReactNode; count?: number | string }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="relative -mb-px flex h-10 items-center gap-1.5 border-b-2 border-transparent px-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink"
    >
      {children}
      {count !== undefined && count !== 0 && count !== "" && <span className="rounded-full bg-black/[0.07] px-1.5 text-[10.5px] font-semibold text-ink-2">{count}</span>}
    </TabsPrimitive.Trigger>
  );
}
export const TabsContent = TabsPrimitive.Content;

/* ─────────── Searchable combobox ─────────── */
export interface ComboOption {
  value: string;
  label: string;
  hint?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  clearable = true,
  disabled,
  emptyText = "No results",
  footer,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  emptyText?: string;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-left text-[13px] hover:border-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:bg-surface-2 disabled:text-ink-3",
          className,
        )}
      >
        <span className={cn("truncate", !selected && "text-ink-3")}>{selected?.label ?? placeholder}</span>
        <span className="flex items-center gap-1 text-ink-3">
          {clearable && selected && !disabled && (
            <span
              role="button"
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 hover:bg-black/5"
            >
              <X size={13} />
            </span>
          )}
          <ChevronsUpDown size={13} />
        </span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align="start" sideOffset={4} className="fade-in z-[55] w-[var(--radix-popover-trigger-width)] min-w-[220px] rounded-lg border border-line bg-surface p-1 shadow-xl">
          <Command className="flex flex-col" filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
            <Command.Input placeholder={searchPlaceholder} className="mb-1 h-8 w-full rounded border-b border-line bg-transparent px-2 text-[13px] outline-none placeholder:text-ink-3" />
            <Command.List className="max-h-64 overflow-auto">
              <Command.Empty className="px-3 py-4 text-center text-[12.5px] text-ink-3">{emptyText}</Command.Empty>
              {options.map((o) => (
                <Command.Item
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-[13px] data-[selected=true]:bg-accent-soft"
                >
                  <span className="truncate">{o.label}</span>
                  <span className="flex items-center gap-2 text-ink-3">
                    {o.hint && <span className="text-[11px]">{o.hint}</span>}
                    {o.value === value && <Check size={13} className="text-accent" />}
                  </span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
          {footer && <div className="mt-1 border-t border-line p-1">{footer}</div>}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
