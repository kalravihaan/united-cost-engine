/**
 * PDF text-layer extraction (pdfjs). Returns positioned text items; knows nothing about CAD semantics.
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
  /** true when the text is drawn rotated (pattern-piece labels) */
  rotated: boolean;
  /** index in content-stream order */
  order: number;
}

export interface PdfText {
  pageCount: number;
  pages: Array<{ width: number; height: number; items: TextItem[] }>;
}

export async function extractPdfText(data: Uint8Array | Buffer): Promise<PdfText> {
  // legacy build = Node compatible
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsLike;
  return extractWithPdfjs(pdfjs, data);
}

export interface PdfJsLike {
  getDocument: (o: unknown) => { promise: Promise<PdfDoc> };
}

/** Same extraction for any pdf.js build (Node server, or the browser bundle used by the standalone preview). */
export async function extractWithPdfjs(pdfjs: PdfJsLike, data: Uint8Array | Buffer): Promise<PdfText> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise;
  const pages: PdfText["pages"] = [];
  let order = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of tc.items as Array<{ str: string; transform: number[]; width: number; height: number }>) {
      if (typeof it.str !== "string") continue;
      const [a, b, , , e, f] = it.transform;
      items.push({
        str: it.str,
        x: e,
        // flip to top-left origin
        y: vp.height - f,
        w: it.width,
        h: it.height,
        page: p,
        rotated: Math.abs(b) > Math.abs(a) * 0.5,
        order: order++,
      });
    }
    pages.push({ width: vp.width, height: vp.height, items });
  }
  return { pageCount: doc.numPages, pages };
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    getTextContent: () => Promise<{ items: unknown[] }>;
  }>;
}

/** Group non-rotated items into visual lines (top→bottom, left→right). */
export function toLines(items: TextItem[], yTol = 3): string[] {
  const horizontal = items.filter((i) => !i.rotated && i.str.trim() !== "");
  const sorted = [...horizontal].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= yTol) last.push(it);
    else lines.push([it]);
  }
  return lines.map((l) =>
    l
      .sort((a, b) => a.x - b.x)
      .map((i) => i.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}
