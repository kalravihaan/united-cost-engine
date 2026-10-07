// pdf.js 6 uses the newest Map/WeakMap helpers; older browsers lack them
for (const C of [Map, WeakMap] as unknown as Array<{ prototype: Record<string, unknown> }>) {
  if (!C.prototype.getOrInsert) C.prototype.getOrInsert = function (this: Map<unknown, unknown>, k: unknown, v: unknown) { if (!this.has(k)) this.set(k, v); return this.get(k); };
  if (!C.prototype.getOrInsertComputed) C.prototype.getOrInsertComputed = function (this: Map<unknown, unknown>, k: unknown, f: (k: unknown) => unknown) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); };
}
// run pdf.js on the main thread ("fake worker"): works from file:// with no separate worker file
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs";
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfWorker;
