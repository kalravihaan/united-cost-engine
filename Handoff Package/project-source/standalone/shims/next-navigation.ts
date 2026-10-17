import * as React from "react";

/** `next/navigation` replacement for the single-file build: the route lives in the URL hash (#/path?query). */
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
if (typeof window !== "undefined") window.addEventListener("hashchange", notify);
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};
const read = () => {
  const h = (typeof location !== "undefined" ? location.hash : "").replace(/^#/, "") || "/";
  const i = h.indexOf("?");
  return { path: (i < 0 ? h : h.slice(0, i)) || "/", query: i < 0 ? "" : h.slice(i + 1) };
};

export function usePathname() {
  return React.useSyncExternalStore(subscribe, () => read().path, () => "/");
}
export function useSearchParams() {
  const q = React.useSyncExternalStore(subscribe, () => read().query, () => "");
  return React.useMemo(() => new URLSearchParams(q), [q]);
}
export function useRouter() {
  return React.useMemo(
    () => ({
      push: (href: string) => {
        location.hash = href;
      },
      replace: (href: string) => {
        history.replaceState(null, "", "#" + href);
        notify();
      },
      back: () => history.back(),
      refresh: () => notify(),
    }),
    [],
  );
}
export function notFound(): never {
  throw new Error("Not found");
}
