/* eslint-disable @typescript-eslint/no-explicit-any */
import { ROUTES } from "./gen/routes";
import { prisma } from "./shims/db";
import { blobs } from "./shims/fileStore";

/**
 * The "server" of the single-file build: window.fetch for /api/* calls the real Next route handlers
 * (src/app/api/**), which run the real services against the in-memory store. Nothing leaves the page.
 */
type Compiled = { segs: string[]; mod: Record<string, any>; statics: number };
const compiled: Compiled[] = ROUTES.map((r) => {
  const segs = r.pattern.split("/").filter(Boolean);
  return { segs, mod: r.mod as Record<string, any>, statics: segs.filter((s) => !s.startsWith("[")).length };
}).sort((a, b) => b.statics - a.statics);

function match(pathname: string): { mod: Record<string, any>; params: Record<string, string> } | null {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  for (const r of compiled) {
    if (r.segs.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    r.segs.forEach((s, i) => {
      if (s.startsWith("[")) params[s.slice(1, -1)] = parts[i];
      else if (s !== parts[i]) ok = false;
    });
    if (ok) return { mod: r.mod, params };
  }
  return null;
}

/** Files are served from memory: turn "/api/files/<id>" strings in JSON answers into blob: URLs the browser can display. */
const blobUrls = new Map<string, string>();
async function blobUrl(id: string): Promise<string | null> {
  if (blobUrls.has(id)) return blobUrls.get(id)!;
  const f = await prisma.storedFile.findUnique({ where: { id } });
  const bytes = f && blobs.get(f.storagePath);
  if (!f || !bytes) return null;
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: f.mimeType }));
  blobUrls.set(id, url);
  return url;
}
async function rewrite(v: any): Promise<any> {
  if (typeof v === "string") {
    const m = v.match(/^\/api\/files\/([\w-]+)$/);
    return m ? (await blobUrl(m[1])) ?? v : v;
  }
  if (Array.isArray(v)) return Promise.all(v.map(rewrite));
  if (v && typeof v === "object") {
    const out: any = {};
    for (const [k, x] of Object.entries(v)) out[k] = await rewrite(x);
    return out;
  }
  return v;
}

export function installServer() {
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!raw.startsWith("/api/")) return orig(input as any, init);
    const url = new URL(raw, "http://app.local");
    const route = match(url.pathname);
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? (input as Request).method : "GET")).toUpperCase();
    if (!route) return Response.json({ error: "Not found" }, { status: 404 });
    const handler = route.mod[method];
    if (typeof handler !== "function") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const req = new Request(url.href, { method, headers: init?.headers, body: method === "GET" || method === "HEAD" ? undefined : (init?.body as BodyInit | undefined) });
    const res: Response = await handler(req, { params: Promise.resolve(route.params) });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) return res;
    const text = await res.text();
    const headers = new Headers(res.headers);
    if (!text.includes("/api/files/")) return new Response(text, { status: res.status, headers });
    return new Response(JSON.stringify(await rewrite(JSON.parse(text))), { status: res.status, headers });
  };
}
