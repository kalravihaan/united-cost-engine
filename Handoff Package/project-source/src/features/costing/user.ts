"use client";
import * as React from "react";

const KEY = "uce.user";
let current = "Costing Desk";
const subs = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    current = window.localStorage.getItem(KEY) || current; // convenience only; the server stores the name it receives
  } catch {
    /* storage unavailable */
  }
}

export function getUserName(): string {
  return current;
}

export function useUserName(): [string, (n: string) => void] {
  const name = React.useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
    () => "Costing Desk",
  );
  const set = React.useCallback((n: string) => {
    current = n;
    try {
      window.localStorage.setItem(KEY, n);
    } catch {
      /* ignore */
    }
    subs.forEach((s) => s());
  }, []);
  return [name, set];
}
