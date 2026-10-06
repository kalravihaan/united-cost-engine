import type { Prisma } from "@/generated/prisma/client";
import type { CostingDoc } from "@/types/costing";
import { prisma } from "../db";

export const templateRepository = {
  get: (type: "ACTUAL" | "CLIENT") => prisma.costTemplate.findUnique({ where: { costingType: type } }),
  async save(type: "ACTUAL" | "CLIENT", doc: CostingDoc, source: string | null, user: string) {
    const cur = await prisma.costTemplate.findUnique({ where: { costingType: type } });
    return prisma.costTemplate.upsert({
      where: { costingType: type },
      create: { costingType: type, doc: doc as unknown as Prisma.InputJsonValue, source, updatedBy: user, version: 1 },
      update: { doc: doc as unknown as Prisma.InputJsonValue, source, updatedBy: user, version: (cur?.version ?? 0) + 1 },
    });
  },
};
