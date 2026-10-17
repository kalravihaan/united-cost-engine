import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";

type Tx = Prisma.TransactionClient | typeof prisma;

export const auditRepository = {
  log(
    e: { userName: string; action: string; entityType: string; entityId?: string | null; styleId?: string | null; costingVersionId?: string | null; details?: unknown },
    tx: Tx = prisma,
  ) {
    return tx.auditEvent.create({
      data: {
        userName: e.userName,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId ?? null,
        styleId: e.styleId ?? null,
        costingVersionId: e.costingVersionId ?? null,
        details: (e.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  },
  list(opts: { styleId?: string; entityType?: string; take?: number }) {
    return prisma.auditEvent.findMany({
      where: { styleId: opts.styleId, entityType: opts.entityType },
      orderBy: { at: "desc" },
      take: opts.take ?? 100,
    });
  },
};
