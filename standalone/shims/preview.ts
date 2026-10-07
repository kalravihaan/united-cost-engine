import * as pdfjs from "pdfjs-dist/build/pdf.min.mjs";

/** Browser replacement of src/lib/cad/preview.ts: render page 1 of the CAD PDF to PNG with the page's own canvas. */
export async function renderPdfPreview(data: Uint8Array, targetWidth = 1600): Promise<Uint8Array | null> {
  try {
    const doc = await (pdfjs as any).getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false }).promise; // eslint-disable-line @typescript-eslint/no-explicit-any
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, targetWidth / base.width) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
