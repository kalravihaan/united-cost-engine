// pdf.js 6 uses the newest Map/WeakMap helpers; older browsers (and this Chromium) lack them
for (const C of [Map, WeakMap] as unknown as Array<{ prototype: Record<string, unknown> }>) {
  if (!C.prototype.getOrInsert) C.prototype.getOrInsert = function (this: Map<unknown, unknown>, k: unknown, v: unknown) { if (!this.has(k)) this.set(k, v); return this.get(k); };
  if (!C.prototype.getOrInsertComputed) C.prototype.getOrInsertComputed = function (this: Map<unknown, unknown>, k: unknown, f: (k: unknown) => unknown) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); };
}

import * as calc from "@/lib/calculations";
import { validateCosting } from "@/lib/validation/validate";
import { parseCadText } from "@/lib/cad/cadParser";
import { extractWithPdfjs, type PdfJsLike } from "@/lib/cad/pdfText";
import { DEFAULT_RULES } from "@/data/defaultRules";
import { cadStyleMatches } from "@/lib/normalization/styleMatching";
import { exportExcel, exportPdf } from "@/lib/export/documents";
import * as pdfjs from "pdfjs-dist/build/pdf.min.mjs";
import * as pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs";

// run pdf.js on the main thread ("fake worker"): no separate worker file or origin rules to depend on
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfWorker;

/** Read a CAD PDF in the browser: extracted values + a preview image of page 1. */
async function readCad(buf: ArrayBuffer): Promise<{ cad: ReturnType<typeof parseCadText>; preview: string | null }> {
  const lib = pdfjs as unknown as PdfJsLike;
  const text = await extractWithPdfjs(lib, new Uint8Array(buf.slice(0)));
  const cad = parseCadText(text);
  let preview: string | null = null;
  try {
    const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 1400 / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await (page as unknown as { render: (o: unknown) => { promise: Promise<void> } }).render({ canvasContext: ctx, viewport, canvas }).promise;
    preview = canvas.toDataURL("image/jpeg", 0.8);
  } catch (e) {
    console.error("cad preview failed: " + (e as Error).message);
  }
  return { cad, preview };
}

(window as unknown as Record<string, unknown>).ENGINE = { ...calc, validateCosting, parseCadText, DEFAULT_RULES, cadStyleMatches, exportExcel, exportPdf, readCad };
