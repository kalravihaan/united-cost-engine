import type { Prisma } from "@/generated/prisma/client";
import type { CostingDoc, CostingResult } from "@/types/costing";
import type { FieldChange } from "@/lib/calculations/diff";
import { prisma } from "../db";

type Tx = Prisma.TransactionClient;

export interface SaveVersionInput {
  styleId: string;
  type: "ACTUAL" | "CLIENT";
  doc: CostingDoc;
  result: CostingResult;
  engineVersion: string;
  headline: { totalCost: number | null; costPerPc: number | null; finalPoPrice: number | null };
  changedFields: FieldChange[];
  sourceKind: "IMPORT" | "TEMPLATE" | "MANUAL";
  sourceFile?: string | null;
  sourceSheet?: string | null;
  importBatchId?: string | null;
  note?: string | null;
  createdBy: string;
}

export const costingRepository = {
  /** Append-only: always creates version max+1 inside the caller's transaction. */
  async appendVersion(tx: Tx, i: SaveVersionInput) {
    const costing = await tx.costing.upsert({ where: { styleId_type: { styleId: i.styleId, type: i.type } }, create: { styleId: i.styleId, type: i.type }, update: {} });
    const last = await tx.costingVersion.findFirst({ where: { costingId: costing.id }, orderBy: { versionNo: "desc" }, select: { versionNo: true } });
    return tx.costingVersion.create({
      data: {
        costingId: costing.id,
        versionNo: (last?.versionNo ?? 0) + 1,
        sourceKind: i.sourceKind,
        sourceFile: i.sourceFile ?? null,
        sourceSheet: i.sourceSheet ?? null,
        importBatchId: i.importBatchId ?? null,
        doc: i.doc as unknown as Prisma.InputJsonValue,
        result: i.result as unknown as Prisma.InputJsonValue,
        engineVersion: i.engineVersion,
        totalCost: i.headline.totalCost,
        costPerPc: i.headline.costPerPc,
        finalPoPrice: i.headline.finalPoPrice,
        changedFields: i.changedFields as unknown as Prisma.InputJsonValue,
        note: i.note ?? null,
        createdBy: i.createdBy,
      },
    });
  },

  async latest(styleId: string, type: "ACTUAL" | "CLIENT") {
    const c = await prisma.costing.findUnique({ where: { styleId_type: { styleId, type } } });
    if (!c) return null;
    return prisma.costingVersion.findFirst({ where: { costingId: c.id }, orderBy: { versionNo: "desc" } });
  },

  async versions(styleId: string, type: "ACTUAL" | "CLIENT") {
    const c = await prisma.costing.findUnique({ where: { styleId_type: { styleId, type } } });
    if (!c) return [];
    return prisma.costingVersion.findMany({
      where: { costingId: c.id },
      orderBy: { versionNo: "desc" },
      select: { id: true, versionNo: true, sourceKind: true, sourceFile: true, sourceSheet: true, totalCost: true, costPerPc: true, finalPoPrice: true, changedFields: true, note: true, createdBy: true, createdAt: true, engineVersion: true },
    });
  },

  byId: (id: string) => prisma.costingVersion.findUnique({ where: { id }, include: { costing: { include: { style: true } } } }),
};
