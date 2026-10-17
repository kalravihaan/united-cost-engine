import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";

type Tx = Prisma.TransactionClient | typeof prisma;

export const fileRepository = {
  create: (
    data: { kind: "STYLE_IMAGE" | "CAD_PDF" | "CAD_PREVIEW" | "SOURCE_WORKBOOK"; originalName: string; mimeType: string; size: number; sha256: string; storagePath: string; styleId?: string | null; uploadedBy: string },
    tx: Tx = prisma,
  ) => tx.storedFile.create({ data }),
  byId: (id: string) => prisma.storedFile.findUnique({ where: { id } }),
  listForStyle: (styleId: string, kind?: "STYLE_IMAGE" | "CAD_PDF" | "CAD_PREVIEW") =>
    prisma.storedFile.findMany({ where: { styleId, kind }, orderBy: { createdAt: "desc" } }),
};

export const cadRepository = {
  latestForStyle: (styleId: string) => prisma.cadExtraction.findFirst({ where: { styleId }, orderBy: { createdAt: "desc" } }),
  create: (data: { styleId: string; fileId: string; revision: number; parserVersion: string; data: unknown; styleNumberRead: string | null; needsVerification: boolean; createdBy: string }) =>
    prisma.cadExtraction.create({ data: { ...data, data: data.data as Prisma.InputJsonValue } }),
  nextRevision: async (styleId: string, fileId: string) => {
    const last = await prisma.cadExtraction.findFirst({ where: { styleId, fileId }, orderBy: { revision: "desc" }, select: { revision: true } });
    return (last?.revision ?? 0) + 1;
  },
  history: (styleId: string) => prisma.cadExtraction.findMany({ where: { styleId }, orderBy: { createdAt: "desc" }, select: { id: true, fileId: true, revision: true, createdAt: true, createdBy: true, needsVerification: true, parserVersion: true } }),
};
