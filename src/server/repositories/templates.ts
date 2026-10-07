import type { Prisma } from "@/generated/prisma/client";
import type { CostingDoc } from "@/types/costing";
import { prisma } from "../db";

export const DEFAULT_FORMAT = "DEFAULT";

export const templateRepository = {
  get: (type: "ACTUAL" | "CLIENT", format = DEFAULT_FORMAT) => prisma.costTemplate.findUnique({ where: { costingType_formatKey: { costingType: type, formatKey: format } } }),
  /** every stored layout of a mode */
  list: (type: "ACTUAL" | "CLIENT") => prisma.costTemplate.findMany({ where: { costingType: type }, orderBy: { formatKey: "asc" } }),
  async save(type: "ACTUAL" | "CLIENT", doc: CostingDoc, source: string | null, user: string, format = DEFAULT_FORMAT) {
    const where = { costingType_formatKey: { costingType: type, formatKey: format } };
    const cur = await prisma.costTemplate.findUnique({ where });
    return prisma.costTemplate.upsert({
      where,
      create: { costingType: type, formatKey: format, doc: doc as unknown as Prisma.InputJsonValue, source, updatedBy: user, version: 1 },
      update: { doc: doc as unknown as Prisma.InputJsonValue, source, updatedBy: user, version: (cur?.version ?? 0) + 1 },
    });
  },
};
