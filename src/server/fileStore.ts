import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * File storage abstraction. Local disk today; implement the same interface for S3/GCS later –
 * nothing else in the app touches the file system for user uploads.
 */
export interface FileStore {
  put(bytes: Buffer, opts: { folder: string; name: string }): Promise<{ storagePath: string; sha256: string; size: number }>;
  get(storagePath: string): Promise<Buffer>;
}

export function sha256(bytes: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";

class LocalFileStore implements FileStore {
  constructor(private root: string) {}

  async put(bytes: Buffer, opts: { folder: string; name: string }) {
    const hash = sha256(bytes);
    const rel = path.posix.join(safeName(opts.folder), `${hash.slice(0, 16)}-${safeName(opts.name)}`);
    const abs = path.join(this.root, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, bytes);
    return { storagePath: rel, sha256: hash, size: bytes.length };
  }

  async get(storagePath: string) {
    const abs = path.resolve(this.root, storagePath);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage path");
    return fs.readFile(abs);
  }
}

let store: FileStore | null = null;
export function fileStore(): FileStore {
  return (store ??= new LocalFileStore(path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR ?? "./storage")));
}
