import { exportExcel as excel, exportPdf as pdf, type ExportInput } from "@/lib/export/documents";
// TTFs are embedded as base64 text by the build (esbuild loader)
import regularB64 from "../../assets/fonts/DejaVuSans.ttf";
import boldB64 from "../../assets/fonts/DejaVuSans-Bold.ttf";

export { COMPANY, type ExportInput } from "@/lib/export/documents";

const u8 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
let fonts: { regular: Uint8Array; bold: Uint8Array } | null = null;

/** Browser replacements of src/services/exportService.ts (same exports). */
export async function exportExcel(i: ExportInput): Promise<Uint8Array> {
  return excel(i);
}
export async function exportPdf(i: ExportInput): Promise<Uint8Array> {
  fonts ??= { regular: u8(regularB64 as unknown as string), bold: u8(boldB64 as unknown as string) };
  return pdf(i, fonts);
}

/** Phone photos are multi-megabyte; shrink for documents using the browser's own image decoder. */
export async function downscaleImage(bytes: Uint8Array, mime: string, maxPx = 700): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!/png|jpe?g|webp/.test(mime)) return { bytes, mime };
  try {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
    const scale = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob) return { bytes, mime };
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg" };
  } catch {
    return { bytes, mime };
  }
}
