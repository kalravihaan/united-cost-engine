/* eslint-disable @typescript-eslint/no-explicit-any */
import { memdb } from "./shims/db";
import { blobs } from "./shims/fileStore";

/** Data file format + browser autosave (IndexedDB). A data file is gzip-compressed JSON: all tables + uploaded files. */
export const FORMAT = "uce-data";
const VERSION = 1;
const IDB = "uce-standalone";

const toB64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Payload {
  format: string;
  version: number;
  savedAt: string;
  db: Record<string, any[]>;
  blobs: Record<string, string>;
}

export function buildPayload(): Payload {
  const b: Record<string, string> = {};
  for (const [k, v] of blobs) b[k] = toB64(v);
  return { format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), db: memdb.snapshot(), blobs: b };
}

export function applyPayload(p: Payload) {
  if (!p || p.format !== FORMAT || !p.db) throw new Error("This is not a Cost Engine data file.");
  if (p.version > VERSION) throw new Error("This data file was made by a newer version of the Cost Engine.");
  memdb.restore(p.db);
  blobs.clear();
  for (const [k, v] of Object.entries(p.blobs ?? {})) blobs.set(k, fromB64(v));
}

async function pipe(data: Uint8Array, stream: any): Promise<Uint8Array> {
  const out = new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
export async function toFileBytes(p: Payload): Promise<{ bytes: Uint8Array; gzip: boolean }> {
  const raw = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream === "undefined") return { bytes: raw, gzip: false };
  return { bytes: await pipe(raw, new CompressionStream("gzip")), gzip: true };
}
export async function fromFileBytes(bytes: Uint8Array): Promise<Payload> {
  let raw = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot open compressed data files.");
    raw = await pipe(bytes, new DecompressionStream("gzip"));
  }
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new Error("This is not a Cost Engine data file.");
  }
}

/* ───────── IndexedDB autosave ───────── */
const open = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("state");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const tx = db.transaction("state", mode);
    const rq = fn(tx.objectStore("state"));
    tx.oncomplete = () => { db.close(); res(rq.result); };
    tx.onerror = () => { db.close(); rej(tx.error); };
  });
}
export const loadAutosave = async (): Promise<Payload | null> => {
  try { return ((await idb("readonly", (s) => s.get("db"))) as Payload | undefined) ?? null; } catch { return null; }
};
export const clearAutosave = async () => { try { await idb("readwrite", (s) => s.delete("db")); } catch { /* storage unavailable */ } };

let timer: ReturnType<typeof setTimeout> | null = null;
let listeners: Array<(s: { at: Date | null; error: string | null }) => void> = [];
export const onSaveState = (fn: (s: { at: Date | null; error: string | null }) => void) => { listeners.push(fn); return () => { listeners = listeners.filter((x) => x !== fn); }; };
export async function saveNow() {
  try {
    await idb("readwrite", (s) => s.put(buildPayload(), "db"));
    listeners.forEach((l) => l({ at: new Date(), error: null }));
  } catch (e) {
    listeners.forEach((l) => l({ at: null, error: (e as Error).message || "Browser storage is not available" }));
  }
}
export function startAutosave() {
  memdb.onChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void saveNow(); }, 700);
  });
  // closing or hiding the tab within the debounce window must not lose the last change
  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    void saveNow();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}
