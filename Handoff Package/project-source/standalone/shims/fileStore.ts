import { sha256Hex } from "./sha256";

/** Uploaded images / CAD PDFs live in memory (saved inside the data file); replaces src/server/fileStore.ts. */
export interface FileStore {
  put(bytes: Uint8Array, opts: { folder: string; name: string }): Promise<{ storagePath: string; sha256: string; size: number }>;
  get(storagePath: string): Promise<Uint8Array>;
  remove(storagePath: string): Promise<void>;
}
export const sha256 = (b: Uint8Array) => sha256Hex(b);
const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";

const g = globalThis as unknown as { __uceBlobs?: Map<string, Uint8Array> };
export const blobs: Map<string, Uint8Array> = (g.__uceBlobs ??= new Map());

const store: FileStore = {
  async put(bytes, opts) {
    const hash = sha256Hex(bytes);
    const rel = `${safeName(opts.folder)}/${hash.slice(0, 16)}-${safeName(opts.name)}`;
    // reference workbooks are only used to learn a structure; their bytes are not kept
    if (opts.folder !== "reference-workbooks") blobs.set(rel, new Uint8Array(bytes));
    return { storagePath: rel, sha256: hash, size: bytes.length };
  },
  async get(storagePath) {
    const b = blobs.get(storagePath);
    if (!b) throw new Error("File not found");
    return b;
  },
  async remove(storagePath) {
    blobs.delete(storagePath);
  },
};
export const fileStore = (): FileStore => store;
