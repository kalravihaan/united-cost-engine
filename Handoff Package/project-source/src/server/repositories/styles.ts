import { prisma } from "../db";

const include = {
  customer: true,
  brand: true,
  category: true,
  aliases: true,
  costings: { include: { versions: { orderBy: { versionNo: "desc" as const }, take: 1, select: { versionNo: true, createdAt: true, totalCost: true, costPerPc: true, sourceKind: true } } } },
};

export const styleRepository = {
  list(opts: { q?: string; take?: number; skip?: number } = {}) {
    const q = opts.q?.trim();
    return prisma.style.findMany({
      where: q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { color: { contains: q, mode: "insensitive" } }] } : undefined,
      include,
      orderBy: { number: "asc" },
      take: opts.take ?? 200,
      skip: opts.skip ?? 0,
    });
  },
  count: () => prisma.style.count(),
  byId: (id: string) => prisma.style.findUnique({ where: { id }, include }),
  byNumber: (number: string) => prisma.style.findUnique({ where: { number }, include }),
  /** every style with the names we know it by – input to the matcher */
  async matchCandidates() {
    const rows = await prisma.style.findMany({ select: { id: true, number: true, description: true, color: true, aliases: { select: { alias: true } } } });
    return rows;
  },
  create: (data: { number: string; description?: string | null; color?: string | null; customerId?: string | null; brandId?: string | null; categoryId?: string | null }) => prisma.style.create({ data, include }),
  update: (id: string, data: { description?: string | null; color?: string | null; customerId?: string | null; brandId?: string | null; categoryId?: string | null; imageFileId?: string | null }) =>
    prisma.style.update({ where: { id }, data, include }),
  addAlias: (styleId: string, alias: string, source: string | null, confirmedBy: string) =>
    prisma.styleAlias.upsert({ where: { alias }, create: { styleId, alias, source, confirmedBy }, update: {} }),
};
