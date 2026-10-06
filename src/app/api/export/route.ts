import { handle, HttpError, readJson } from "@/server/http";
import { prisma } from "@/server/db";
import { fileStore } from "@/server/fileStore";
import { fileRepository, cadRepository } from "@/server/repositories/files";
import { costingRepository } from "@/server/repositories/costings";
import { auditRepository } from "@/server/repositories/audit";
import { costingDocSchema } from "@/lib/validation/schema";
import { downscaleImage, exportExcel, exportPdf } from "@/services/exportService";
import { getRuleSet } from "@/services/rulesService";
import type { CadData, CostingDoc } from "@/types/costing";

export const runtime = "nodejs";

/**
 * Export the costing exactly as it is on screen (including unsaved edits) – every number is recalculated
 * by the engine from the posted document, never taken from the client.
 */
export const POST = handle(async (req, _ctx, user) => {
  const b = await readJson<{ styleId: string; doc: unknown; format: "pdf" | "xlsx"; versionNo?: number | null; unsaved?: boolean; pairedDoc?: unknown }>(req);
  if (b.format !== "pdf" && b.format !== "xlsx") throw new Error("Invalid export format");
  const parsed = costingDocSchema.safeParse(b.doc);
  if (!parsed.success) throw new Error("Invalid costing document");
  const doc = parsed.data as unknown as CostingDoc;

  const style = await prisma.style.findUnique({ where: { id: b.styleId }, include: { customer: true, brand: true, category: true } });
  if (!style) throw new HttpError(404, "Style not found");

  const [cadRow, imageFile, rules] = await Promise.all([cadRepository.latestForStyle(style.id), style.imageFileId ? fileRepository.byId(style.imageFileId) : null, getRuleSet()]);
  const image = imageFile ? await downscaleImage(await fileStore().get(imageFile.storagePath), imageFile.mimeType) : null;

  // other costing of the same style (saved) – or an explicit pairing posted by the user
  const otherType = doc.type === "ACTUAL" ? "CLIENT" : "ACTUAL";
  const saved = await costingRepository.latest(style.id, otherType);
  let other: { doc: CostingDoc; paired: boolean; label?: string } | null = saved ? { doc: saved.doc as unknown as CostingDoc, paired: false } : null;
  if (!other && b.pairedDoc) {
    const p = costingDocSchema.safeParse(b.pairedDoc);
    if (p.success) other = { doc: p.data as unknown as CostingDoc, paired: true, label: `${otherType} costing of style ${p.data.style.number}` };
  }

  const input = {
    doc,
    style: { number: style.number, color: style.color },
    customer: style.customer?.name ?? null,
    brand: style.brand?.name ?? null,
    category: style.category?.name ?? null,
    versionNo: b.versionNo ?? null,
    unsaved: !!b.unsaved,
    user,
    cad: cadRow ? (cadRow.data as unknown as CadData) : null,
    image,
    other,
    rules,
  };
  const bytes = b.format === "pdf" ? await exportPdf(input) : await exportExcel(input);
  await auditRepository.log({ userName: user, action: "EXPORT", entityType: "Costing", styleId: style.id, details: { format: b.format, type: doc.type, versionNo: b.versionNo ?? null, unsaved: !!b.unsaved } });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": b.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${style.number}_${doc.type.toLowerCase()}_costing.${b.format}"`,
      "cache-control": "no-store",
    },
  });
});
