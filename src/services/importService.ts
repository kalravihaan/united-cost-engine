import crypto from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { CostingDoc, ImportIssue } from "@/types/costing";
import { parseActualWorkbook } from "@/lib/parsers/actualCostingParser";
import { parseClientWorkbook } from "@/lib/parsers/clientCostingParser";
import { calculateCosting, ENGINE_VERSION, headline } from "@/lib/calculations";
import { diffCostings } from "@/lib/calculations/diff";
import { groupForLine } from "@/lib/calculations/grouping";
import { DEFAULT_RULES } from "@/data/defaultRules";
import { uomDimension } from "@/lib/normalization/labels";
import { prisma } from "@/server/db";
import { fileStore, sha256 } from "@/server/fileStore";
import { fileRepository } from "@/server/repositories/files";
import { costingRepository } from "@/server/repositories/costings";
import { auditRepository } from "@/server/repositories/audit";

export interface ImportReport {
  batchId: string;
  kind: "ACTUAL" | "CLIENT";
  fileName: string;
  sheets: number;
  created: number;
  skipped: number;
  stylesCreated: number;
  issues: ImportIssue[];
  perSheet: Array<{ sheet: string; style: string; status: "created" | "unchanged" | "error"; version?: number; note?: string }>;
}

/** JSON with sorted keys – Postgres jsonb does not preserve key order, so hashes must not depend on it. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** Hash that ignores volatile fields so re-importing the same workbook is a no-op. */
function stableHash(doc: CostingDoc): string {
  const copy = JSON.parse(JSON.stringify(doc)) as CostingDoc;
  if (copy.source) {
    copy.source.importedAt = "";
    delete copy.source.importBatchId;
  }
  return crypto.createHash("sha256").update(canonicalJson(copy)).digest("hex");
}

async function seedMastersFromDoc(tx: Prisma.TransactionClient, doc: CostingDoc, source: string) {
  const type = doc.type;
  // sections
  if (doc.type === "CLIENT") {
    for (const [i, s] of doc.client.sections.entries()) {
      await tx.costSection.upsert({ where: { costingType_key: { costingType: "CLIENT", key: s.key } }, create: { costingType: "CLIENT", key: s.key, label: s.label, phase: s.phase, sortOrder: i }, update: {} });
    }
  } else {
    const labels: Array<[string, string]> = [["FABRIC_ORDER", "FABRIC ORDER"], ["CMT", "CMT"], ["TRIMS", "TRIMS"], ["LD_CHARGES", "LD CHARGES"], ["REJECT", "REJECT"]];
    for (const [i, [key, label]] of labels.entries()) {
      await tx.costSection.upsert({ where: { costingType_key: { costingType: "ACTUAL", key } }, create: { costingType: "ACTUAL", key, label, sortOrder: i }, update: {} });
    }
  }
  for (const l of doc.lines) {
    const name = l.item.trim();
    if (!name) continue;
    await tx.costItem.upsert({
      where: { costingType_sectionKey_name: { costingType: type, sectionKey: l.sectionKey, name } },
      create: { costingType: type, sectionKey: l.sectionKey, name, defaultUom: l.uom, itemType: l.itemType, source },
      update: {},
    });
    if (l.uom) await tx.uom.upsert({ where: { code: l.uom }, create: { code: l.uom, source, dimension: uomDimension(l.uom) }, update: {} });
    if ((l.rate ?? 0) > 0 && l.calc === "QTY_X_RATE") {
      const exists = await tx.rateMaster.findFirst({ where: { costingType: type, sectionKey: l.sectionKey, itemName: name, rate: l.rate!, styleNumber: doc.style.number } });
      if (!exists) await tx.rateMaster.create({ data: { costingType: type, sectionKey: l.sectionKey, itemName: name, rate: l.rate!, uom: l.uom, gstRate: l.gstRate, source, styleNumber: doc.style.number } });
    }
    const group = groupForLine(l, type, DEFAULT_RULES.groupRules)?.group;
    if (group === "Fabric" && name && (l.rate ?? 0) > 0) {
      const a = l.attributes;
      await tx.fabricMaster.upsert({
        where: { name },
        create: { name, fabricType: (a.fabricType as string) ?? null, fabricFinish: (a.fabricFinish as string) ?? null, construction: (a.construction as string) ?? null, knitGauge: (a.knitGauge as string) ?? null, cuttableWidth: (a.cuttableWidth as string) ?? null, defaultUom: l.uom, lastRate: l.rate, source },
        update: { lastRate: l.rate, source },
      });
    }
  }
}

async function upsertStyle(tx: Prisma.TransactionClient, doc: CostingDoc): Promise<{ id: string; created: boolean }> {
  const found = await tx.style.findUnique({ where: { number: doc.style.number } });
  if (found) {
    if (!found.color && doc.style.color) await tx.style.update({ where: { id: found.id }, data: { color: doc.style.color } });
    return { id: found.id, created: false };
  }
  const s = await tx.style.create({ data: { number: doc.style.number, color: doc.style.color ?? null, description: doc.style.label } });
  return { id: s.id, created: true };
}

async function importDocs(
  kind: "ACTUAL" | "CLIENT",
  fileName: string,
  bytes: Buffer,
  docs: Array<{ doc: CostingDoc; image?: { buffer: Buffer; extension: string } }>,
  issues: ImportIssue[],
  extra: (tx: Prisma.TransactionClient, batchId: string) => Promise<void>,
  user: string,
): Promise<ImportReport> {
  const hash = sha256(bytes);
  const stored = await fileStore().put(bytes, { folder: "source-workbooks", name: fileName });
  const perSheet: ImportReport["perSheet"] = [];
  let created = 0;
  let skipped = 0;
  let stylesCreated = 0;

  const batch = await prisma.$transaction(
    async (tx) => {
      const file = await fileRepository.create(
        { kind: "SOURCE_WORKBOOK", originalName: fileName, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: stored.size, sha256: hash, storagePath: stored.storagePath, uploadedBy: user },
        tx,
      );
      const b = await tx.importBatch.create({ data: { kind, fileName, sha256: hash, fileId: file.id, sheetCount: docs.length, created: 0, skipped: 0, report: {}, createdBy: user } });

      for (const { doc, image } of docs) {
        try {
          const style = await upsertStyle(tx, doc);
          if (style.created) stylesCreated++;
          const costing = await tx.costing.findUnique({ where: { styleId_type: { styleId: style.id, type: kind } } });
          const prev = costing ? await tx.costingVersion.findFirst({ where: { costingId: costing.id }, orderBy: { versionNo: "desc" } }) : null;
          const prevDoc = prev ? (prev.doc as unknown as CostingDoc) : null;
          // identical to the latest version that came from this very source sheet → nothing to do
          if (prevDoc && prev?.sourceKind === "IMPORT" && stableHash(prevDoc) === stableHash(doc)) {
            skipped++;
            perSheet.push({ sheet: doc.source!.sheet, style: doc.style.number, status: "unchanged", version: prev.versionNo });
            continue;
          }
          const withBatch: CostingDoc = { ...doc, source: { ...doc.source!, importBatchId: b.id } };
          const result = calculateCosting(withBatch);
          const v = await costingRepository.appendVersion(tx, {
            styleId: style.id,
            type: kind,
            doc: withBatch,
            result,
            engineVersion: ENGINE_VERSION,
            headline: headline(withBatch, result),
            changedFields: diffCostings(prevDoc, withBatch),
            sourceKind: "IMPORT",
            sourceFile: fileName,
            sourceSheet: doc.source!.sheet,
            importBatchId: b.id,
            note: `Imported from ${fileName} → sheet ${doc.source!.sheet}`,
            createdBy: user,
          });
          created++;
          perSheet.push({ sheet: doc.source!.sheet, style: doc.style.number, status: "created", version: v.versionNo });
          await seedMastersFromDoc(tx, withBatch, `${fileName} → ${doc.source!.sheet}`);
          if (image) {
            const put = await fileStore().put(image.buffer, { folder: "style-images", name: `${doc.style.number}.${image.extension}` });
            const f = await fileRepository.create({ kind: "STYLE_IMAGE", originalName: `${doc.style.number}.${image.extension}`, mimeType: `image/${image.extension === "jpg" ? "jpeg" : image.extension}`, size: put.size, sha256: put.sha256, storagePath: put.storagePath, styleId: style.id, uploadedBy: user }, tx);
            const st = await tx.style.findUnique({ where: { id: style.id }, select: { imageFileId: true } });
            if (!st?.imageFileId) await tx.style.update({ where: { id: style.id }, data: { imageFileId: f.id } });
          }
          await auditRepository.log({ userName: user, action: "IMPORT_VERSION", entityType: "CostingVersion", entityId: v.id, styleId: style.id, costingVersionId: v.id, details: { file: fileName, sheet: doc.source!.sheet, versionNo: v.versionNo } }, tx);
        } catch (e) {
          perSheet.push({ sheet: doc.source?.sheet ?? "?", style: doc.style.number, status: "error", note: (e as Error).message });
          issues.push({ level: "error", code: "SHEET_IMPORT_FAILED", message: `${doc.source?.sheet}: ${(e as Error).message}` });
          throw e; // roll the whole batch back: a partial import would be misleading
        }
      }
      await extra(tx, b.id);
      return b;
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  const report: ImportReport = { batchId: batch.id, kind, fileName, sheets: docs.length, created, skipped, stylesCreated, issues, perSheet };
  await prisma.importBatch.update({ where: { id: batch.id }, data: { created, skipped, report: report as unknown as Prisma.InputJsonValue } });
  await auditRepository.log({ userName: user, action: "IMPORT", entityType: "ImportBatch", entityId: batch.id, details: { fileName, kind, created, skipped, stylesCreated } });
  return report;
}

export async function importActualWorkbook(bytes: Buffer, fileName: string, user: string): Promise<ImportReport> {
  const parsed = await parseActualWorkbook(bytes, fileName);
  if (parsed.issues.some((i) => i.level === "error" && i.code !== "DUPLICATE_STYLE") || parsed.sheets.length === 0) {
    throw new Error(`Import refused: ${parsed.issues.filter((i) => i.level === "error").map((i) => i.message).join("; ") || "no sheets"}`);
  }
  return importDocs("ACTUAL", fileName, bytes, parsed.sheets.map((s) => ({ doc: s.doc })), parsed.issues, async () => {}, user);
}

export async function importClientWorkbook(bytes: Buffer, fileName: string, user: string): Promise<ImportReport> {
  const parsed = await parseClientWorkbook(bytes, fileName);
  if (parsed.sheets.length === 0 || parsed.issues.some((i) => i.level === "error")) {
    throw new Error(`Import refused: ${parsed.issues.filter((i) => i.level === "error").map((i) => i.message).join("; ") || "no sheets"}`);
  }
  return importDocs(
    "CLIENT",
    fileName,
    bytes,
    parsed.sheets.map((s) => ({ doc: s.doc, image: s.images[0] ? { buffer: s.images[0].buffer, extension: s.images[0].extension } : undefined })),
    parsed.issues,
    async (tx) => {
      for (const s of parsed.sheets) {
        for (const t of s.overheadTiers) {
          await tx.category.upsert({
            where: { name: t.category },
            create: { name: t.category, overheadMarginRate: t.rate, qty: t.qty, source: `${s.doc.source!.file} → ${t.ref.sheet}!${t.ref.cell}` },
            update: {},
          });
        }
        for (const u of s.uomOptions) await tx.uom.upsert({ where: { code: u }, create: { code: u, source: `${s.doc.source!.file} → UOM drop-down list`, dimension: uomDimension(u) }, update: {} });
      }
    },
    user,
  );
}
