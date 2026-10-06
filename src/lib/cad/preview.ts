interface PdfDocLike {
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: unknown; viewport: unknown; canvas: unknown }) => { promise: Promise<void> };
  }>;
}

/** Render page 1 of a (CAD) PDF to PNG so the UI can show a preview without a PDF viewer plugin. */
export async function renderPdfPreview(data: Uint8Array | Buffer, targetWidth = 1600): Promise<Buffer | null> {
  try {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
      getDocument: (o: unknown) => { promise: Promise<PdfDocLike> };
    };
    const { createCanvas } = await import("@napi-rs/canvas");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, targetWidth / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown, viewport, canvas: canvas as unknown }).promise;
    return canvas.toBuffer("image/png");
  } catch {
    return null; // preview is a convenience; extraction does not depend on it
  }
}
