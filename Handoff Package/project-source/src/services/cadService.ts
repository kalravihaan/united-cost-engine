import type { CadData, CadField } from "@/types/costing";
import { parseCadPdf, CAD_PARSER_VERSION } from "@/lib/cad/cadParser";
import { renderPdfPreview } from "@/lib/cad/preview";
import { prisma } from "@/server/db";
import { fileStore } from "@/server/fileStore";
import { cadRepository, fileRepository } from "@/server/repositories/files";
import { auditRepository } from "@/server/repositories/audit";

const needsVerification = (d: CadData) =>
  [d.styleNumber, d.length, d.width, d.efficiency, d.lengthPerSet, d.totalLength, d.totalPieces].some((f) => (f.requiresVerification || f.value === null) && !f.manual);

export async function uploadCad(args: { styleId: string; bytes: Buffer; fileName: string; user: string }) {
  if (args.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("The CAD file must be a PDF.");
  const style = await prisma.style.findUnique({ where: { id: args.styleId } });
  if (!style) throw new Error("Style not found");
  const data = await parseCadPdf(args.bytes);
  const put = await fileStore().put(args.bytes, { folder: "cad", name: args.fileName });
  const file = await fileRepository.create({ kind: "CAD_PDF", originalName: args.fileName, mimeType: "application/pdf", size: put.size, sha256: put.sha256, storagePath: put.storagePath, styleId: args.styleId, uploadedBy: args.user });
  const png = await renderPdfPreview(args.bytes);
  if (png) {
    const pp = await fileStore().put(png, { folder: "cad-previews", name: `${style.number}.png` });
    await fileRepository.create({ kind: "CAD_PREVIEW", originalName: `${style.number}.png`, mimeType: "image/png", size: pp.size, sha256: pp.sha256, storagePath: pp.storagePath, styleId: args.styleId, uploadedBy: args.user });
  }
  const row = await cadRepository.create({
    styleId: args.styleId,
    fileId: file.id,
    revision: 1,
    parserVersion: CAD_PARSER_VERSION,
    data,
    styleNumberRead: data.styleNumber.value,
    needsVerification: needsVerification(data),
    createdBy: args.user,
  });
  await auditRepository.log({ userName: args.user, action: "CAD_UPLOAD", entityType: "CadExtraction", entityId: row.id, styleId: args.styleId, details: { fileName: args.fileName, styleNumberRead: data.styleNumber.value, warnings: data.warnings.length } });
  return { id: row.id, revision: row.revision, data };
}

type EditableKey = "styleNumber" | "sets" | "length" | "width" | "efficiency" | "lengthPerSet" | "totalLength" | "totalPieces" | "surfacePiecesCount";
const EDITABLE: EditableKey[] = ["styleNumber", "sets", "length", "width", "efficiency", "lengthPerSet", "totalLength", "totalPieces", "surfacePiecesCount"];

/**
 * Manual correction / confirmation of one CAD field. The extracted value is never discarded – the user's
 * value goes to `manual` and a new immutable revision is stored.
 */
export async function editCadField(args: { styleId: string; field: string; value: number | string | null; reason?: string; user: string }) {
  if (!EDITABLE.includes(args.field as EditableKey)) throw new Error(`Field "${args.field}" cannot be edited`);
  const latest = await cadRepository.latestForStyle(args.styleId);
  if (!latest) throw new Error("No CAD extraction for this style");
  const data = structuredClone(latest.data as unknown as CadData);
  const f = data[args.field as EditableKey] as CadField<number | string>;
  const value = args.field === "styleNumber" ? (args.value === null ? null : String(args.value).replace(/^#/, "")) : args.value === null || args.value === "" ? null : Number(args.value);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Value must be a number");
  f.manual = { value, reason: args.reason ?? (value === f.value ? "confirmed as extracted" : "manual correction") };
  const revision = await cadRepository.nextRevision(args.styleId, latest.fileId);
  const row = await cadRepository.create({
    styleId: args.styleId,
    fileId: latest.fileId,
    revision,
    parserVersion: data.parserVersion,
    data,
    styleNumberRead: data.styleNumber.manual?.value ?? data.styleNumber.value,
    needsVerification: needsVerification(data),
    createdBy: args.user,
  });
  await auditRepository.log({ userName: args.user, action: "CAD_FIELD_EDIT", entityType: "CadExtraction", entityId: row.id, styleId: args.styleId, details: { field: args.field, extracted: f.value, manual: value, reason: f.manual.reason } });
  return { id: row.id, revision, data };
}
