import * as React from "react";

/** `next/link` replacement for the single-file build: hash routing (#/styles). */
type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname?: string; search?: string }; prefetch?: boolean; scroll?: boolean; replace?: boolean };

export default function Link({ href, prefetch: _p, scroll: _s, replace: _r, children, ...rest }: Props) {
  void _p; void _s; void _r;
  const h = typeof href === "string" ? href : `${href.pathname ?? "/"}${href.search ?? ""}`;
  return (
    <a href={h.startsWith("/") ? "#" + h : h} {...rest}>
      {children}
    </a>
  );
}
