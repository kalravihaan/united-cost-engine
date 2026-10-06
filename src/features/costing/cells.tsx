"use client";
import * as React from "react";
import { cn } from "@/lib/format";

/**
 * Editable numeric cell. Keeps its own text while focused so "1." / "0.0" can be typed;
 * commits a parsed number (or null when emptied) on every valid keystroke and normalises on blur.
 */
export function NumberCell({
  value,
  onCommit,
  disabled,
  placeholder = "",
  align = "right",
  className,
  scale = 1,
  suffix,
  decimals = 4,
  ariaLabel,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
  /** display = value × scale (e.g. 100 to show a fraction as %) */
  scale?: number;
  suffix?: string;
  decimals?: number;
  ariaLabel?: string;
}) {
  const toText = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(parseFloat((v * scale).toFixed(decimals))));
  const [text, setText] = React.useState(toText(value));
  const [focus, setFocus] = React.useState(false);
  React.useEffect(() => {
    if (!focus) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focus]);

  return (
    <div className={cn("relative", className)}>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onFocus={(e) => {
          setFocus(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocus(false);
          setText(toText(value));
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/,/g, "");
          if (!/^-?\d*\.?\d*$/.test(raw)) return;
          setText(raw);
          if (raw === "" || raw === "-") return onCommit(null);
          const n = Number(raw);
          if (Number.isFinite(n) && !raw.endsWith(".")) onCommit(n / scale);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(toText(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "num h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-[12.5px] text-ink placeholder:text-ink-3/60",
          align === "right" ? "text-right" : "text-left",
          !disabled && "hover:border-line hover:bg-white focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/15",
          disabled && "cursor-default text-ink-2",
          suffix && "pr-5",
        )}
      />
      {suffix && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-3">{suffix}</span>}
    </div>
  );
}

export function TextCell({
  value,
  onCommit,
  disabled,
  placeholder,
  className,
  list,
  ariaLabel,
}: {
  value: string | null | undefined;
  onCommit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  list?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = React.useState(value ?? "");
  const [focus, setFocus] = React.useState(false);
  React.useEffect(() => {
    if (!focus) setText(value ?? "");
  }, [value, focus]);
  return (
    <input
      aria-label={ariaLabel}
      list={list}
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        if (text !== (value ?? "")) onCommit(text);
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(value ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "h-7 w-full rounded border border-transparent bg-transparent px-1.5 text-[12.5px] text-ink placeholder:text-ink-3/60",
        !disabled && "hover:border-line hover:bg-white focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/15",
        disabled && "cursor-default text-ink-2",
        className,
      )}
    />
  );
}
