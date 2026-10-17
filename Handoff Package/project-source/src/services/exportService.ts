import fs from "node:fs";
import path from "node:path";
import { exportExcel as excel, exportPdf as pdf, type ExportInput } from "@/lib/export/documents";

export { COMPANY, type ExportInput } from "@/lib/export/documents";

/** Server-side wrappers: read the bundled fonts from disk, return Buffers. */
const FONT = path.resolve(/* turbopackIgnore: true */ process.cwd(), "assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.resolve(/* turbopackIgnore: true */ process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf");

export async function exportExcel(i: ExportInput): Promise<Buffer> {
  return Buffer.from(await excel(i));
}

export async function exportPdf(i: ExportInput): Promise<Buffer> {
  if (!fs.existsSync(FONT)) throw new Error("PDF fonts are missing (assets/fonts)");
  return Buffer.from(await pdf(i, { regular: fs.readFileSync(FONT), bold: fs.readFileSync(FONT_BOLD) }));
}

/** Photos from phones are multi-megabyte; downscale for documents (keeps exports small and fast). */
export async function downscaleImage(bytes: Buffer, mime: string, maxPx = 700): Promise<{ bytes: Buffer; mime: string }> {
  if (!/png|jpe?g|webp/.test(mime)) return { bytes, mime };
  try {
    const { createCanvas, loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(bytes);
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const canvas = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return { bytes: canvas.toBuffer("image/jpeg", 82), mime: "image/jpeg" };
  } catch {
    return { bytes, mime };
  }
}
