import { NextResponse } from "next/server";
import { actingUser } from "./user";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };

/** Wrap a route handler: uniform JSON errors, never leak stack traces. */
export function handle<P = Record<string, never>>(fn: (req: Request, ctx: { params: P }, user: string) => Promise<Response | unknown>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const params = await ctx.params;
      const out = await fn(req, { params }, actingUser(req));
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : isUserError(e) ? 400 : 500;
      const message = e instanceof Error ? e.message : "Unexpected error";
      if (status === 500) console.error(e);
      return NextResponse.json({ error: status === 500 ? "Internal error" : message }, { status });
    }
  };
}

/** Prisma unique/foreign-key violations and our own validation errors are the caller's fault. */
function isUserError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code && ["P2002", "P2003", "P2025", "P2000"].includes(code)) return true;
  return e instanceof Error && /^(Invalid|Unknown|Style|Value|The |No |Field|Import refused|.* is required|.* not a number|.* already)/.test(e.message);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export async function readFile(req: Request, maxBytes: number, field = "file"): Promise<{ bytes: Buffer; name: string; fields: FormData }> {
  const form = await req.formData();
  const f = form.get(field);
  if (!(f instanceof File)) throw new HttpError(400, `Missing file field "${field}"`);
  if (f.size === 0) throw new HttpError(400, "The file is empty");
  if (f.size > maxBytes) throw new HttpError(413, `File too large (max ${Math.round(maxBytes / 1e6)} MB)`);
  return { bytes: Buffer.from(await f.arrayBuffer()), name: f.name || "upload", fields: form };
}

export function sniffImage(b: Buffer): { ext: "png" | "jpg" | "webp"; mime: string } | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { ext: "webp", mime: "image/webp" };
  return null;
}
